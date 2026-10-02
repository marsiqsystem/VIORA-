import { NextResponse } from "next/server";
import { wixAdminClientServer } from "@/lib/wixAdminClientServer";
import { sendOrderConfirmationEmail } from "@/lib/orderEmail";
import { sendServerCapi } from "@/lib/metaCapiServer";
import { readCookieRaw } from "@/lib/metaFbc";
import { slugFromUrl } from "@/lib/metaCatalogId";
import { COD_CHARGE, PREPAID_DISCOUNT } from "@/lib/checkoutPricing";
import { makePaymentSeal } from "@/lib/crm/paymentSeal";
import { fetchRazorpayPayment } from "@/lib/razorpayVerify";
import { claimOnce, release } from "@/lib/crm/idempotency";
import * as checkoutLeads from "@/lib/crm/checkoutLeads";

type CheckoutAddressPayload = {
  email: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  paymentMethod: "COD" | "PREPAID";
  razorpayPaymentId?: string;
  // Sent by the browser for reference only. What was actually paid is always
  // read from Razorpay (see fetchRazorpayPayment below).
  razorpayAmount?: string;
  // Still sent by the checkout but IGNORED: the COD charge and the amount the
  // courier collects are worked out here, never taken from the browser.
  codCharge?: string | number;
  codAmount?: string;
};

// A payment id may pay for exactly one order.
const PAYMENT_USED_TTL_S = 60 * 60 * 24 * 180;
const paymentUsedKey = (paymentId: string) => `rzp_payment_used:${paymentId}`;

const getWixErrorMessage = (err: any) =>
  err?.details?.applicationError?.description ||
  err?.details?.applicationError?.code ||
  err?.message ||
  "Unknown Wix error";

const normalizeCheckoutId = (checkoutId: unknown) =>
  typeof checkoutId === "string" ? checkoutId.trim() : "";

const normalizeText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const splitName = (fullName: string) => {
  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || fullName,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
  };
};

const indiaSubdivisionCodes: Record<string, string> = {
  "andaman and nicobar islands": "IN-AN",
  "andhra pradesh": "IN-AP",
  "arunachal pradesh": "IN-AR",
  assam: "IN-AS",
  bihar: "IN-BR",
  chandigarh: "IN-CH",
  chhattisgarh: "IN-CT",
  "dadra and nagar haveli and daman and diu": "IN-DH",
  delhi: "IN-DL",
  goa: "IN-GA",
  gujarat: "IN-GJ",
  haryana: "IN-HR",
  "himachal pradesh": "IN-HP",
  "jammu and kashmir": "IN-JK",
  jharkhand: "IN-JH",
  karnataka: "IN-KA",
  kerala: "IN-KL",
  ladakh: "IN-LA",
  lakshadweep: "IN-LD",
  "madhya pradesh": "IN-MP",
  maharashtra: "IN-MH",
  manipur: "IN-MN",
  meghalaya: "IN-ML",
  mizoram: "IN-MZ",
  nagaland: "IN-NL",
  odisha: "IN-OR",
  orissa: "IN-OR",
  puducherry: "IN-PY",
  punjab: "IN-PB",
  rajasthan: "IN-RJ",
  sikkim: "IN-SK",
  "tamil nadu": "IN-TN",
  telangana: "IN-TG",
  tripura: "IN-TR",
  "uttar pradesh": "IN-UP",
  uttarakhand: "IN-UT",
  "west bengal": "IN-WB",
};

const normalizeIndiaSubdivision = (state: string) => {
  const normalized = state.trim();
  if (/^IN-[A-Z]{2}$/i.test(normalized)) {
    return normalized.toUpperCase();
  }
  return indiaSubdivisionCodes[normalized.toLowerCase()] || normalized;
};

const flattenCalculationErrors = (value: unknown): string[] => {
  if (!value) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(flattenCalculationErrors);
  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const ownMessages = [
    record.description,
    record.message,
    record.code,
    record.field,
    record.violatedRule,
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);

  return [
    ...ownMessages,
    ...Object.entries(record)
      .filter(([key]) => !["description", "message", "code", "field", "violatedRule"].includes(key))
      .flatMap(([, nested]) => flattenCalculationErrors(nested)),
  ];
};

// True when Wix refused the order only because of a coupon that no longer
// qualifies. Wix reports this two ways: the older ERROR_INVALID_SUBTOTAL, and
// (seen live from 29 Sep 2026) INVALID_CART with an INVALID_COUPON_STATUS
// violation such as "Coupon CLUBVIORA has an invalid status: MIN_SUBTOTAL_NOT_REACHED".
const isInvalidCouponError = (err: any) => {
  const appErr = err?.details?.applicationError;
  if (appErr?.code === "ERROR_INVALID_SUBTOTAL") return true;
  if (appErr?.code !== "INVALID_CART") return false;
  const violations: any[] = appErr?.data?.violations || [];
  return (
    violations.length > 0 &&
    violations
      .filter((v) => v?.severity === "ERROR")
      .every((v) => v?.code === "INVALID_COUPON_STATUS" || v?.scope === "DISCOUNT")
  );
};

// Create the order, but survive a coupon that no longer meets its minimum.
// A shopper can apply CLUBVIORA (min ₹999), then remove an item so the subtotal
// drops below ₹999 — the coupon stays attached to the Wix cart (but is missing
// from the cart's appliedDiscounts, so the bag can't see it to remove it) and
// createOrder then fails. For a prepaid shopper that meant money taken and no
// order. The coupon was giving no discount anyway, so strip it and place the
// order at the price the shopper saw and paid.
const createOrderWithCouponFallback = async (wixClient: any, checkoutId: string) => {
  try {
    return await wixClient.checkout.createOrder(checkoutId);
  } catch (err: any) {
    if (!isInvalidCouponError(err)) throw err;
    console.warn(
      `createOrder refused an invalid coupon (${err?.details?.applicationError?.code}) — removing it and retrying.`
    );
    try {
      await wixClient.checkout.removeCoupon(checkoutId);
    } catch (rmErr) {
      console.error("Failed to remove coupon from checkout:", rmErr);
    }
    return await wixClient.checkout.createOrder(checkoutId);
  }
};

export async function POST(req: Request) {
  // Set once a Razorpay payment is claimed for this request, and cleared once
  // the Wix order exists — so a failure in between frees the payment for a retry.
  let pendingPaymentClaim = "";

  try {
    const body = await req.json();
    const checkoutId = normalizeCheckoutId(body?.checkoutId);
    const details = body?.details as Partial<CheckoutAddressPayload> | undefined;
    // Only send the Meta Purchase (Conversions API) event if the buyer opted
    // into marketing cookies. Meta is an advertising tool, so a declined buyer
    // must not have their purchase shared for ad measurement.
    const marketingConsent = body?.marketingConsent === true;

    if (!checkoutId) {
      return NextResponse.json({ error: "Missing checkoutId." }, { status: 400 });
    }

    const email = normalizeText(details?.email);
    const fullName = normalizeText(details?.fullName);
    const phone = normalizeText(details?.phone);
    const addressLine1 = normalizeText(details?.addressLine1);
    const addressLine2 = normalizeText(details?.addressLine2);
    const city = normalizeText(details?.city);
    const state = normalizeText(details?.state);
    const postalCode = normalizeText(details?.postalCode);
    const paymentMethod = details?.paymentMethod === "PREPAID" ? "PREPAID" : "COD";
    const razorpayPaymentId = normalizeText(details?.razorpayPaymentId);
    // COD delivery + handling charge — the server's own figure. (It used to come
    // from the browser, as did the cash amount to collect, so a tampered request
    // could set "collect ₹1" on a ₹599 order.)
    const codCharge = paymentMethod === "COD" ? COD_CHARGE : 0;

    if (!email || !fullName || !phone || !addressLine1 || !city || !state || !postalCode) {
      return NextResponse.json(
        { error: "Missing checkout contact or shipping details." },
        { status: 400 }
      );
    }

    // PREPAID: never take the browser's word for a payment. Ask Razorpay what was
    // actually paid, and make sure one payment can't be replayed for a second order.
    let verifiedPaid: number | null = null;
    let paymentUnverified = false;
    // KV was down, so this payment couldn't be locked to one order — don't seal it.
    let paymentClaimDegraded = false;
    if (paymentMethod === "PREPAID") {
      if (!razorpayPaymentId) {
        return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });
      }
      const payment = await fetchRazorpayPayment(razorpayPaymentId);
      if (payment.ok) {
        if (payment.notes?.purpose === "cod-switch") {
          return NextResponse.json({ error: "This payment belongs to another order." }, { status: 409 });
        }
        const claim = await claimOnce(paymentUsedKey(razorpayPaymentId), PAYMENT_USED_TTL_S);
        if (!claim.claimed) {
          return NextResponse.json(
            { error: "This payment has already been used for an order." },
            { status: 409 }
          );
        }
        if (!claim.degraded) pendingPaymentClaim = paymentUsedKey(razorpayPaymentId);
        else paymentClaimDegraded = true;
        verifiedPaid = payment.paid;
      } else if (payment.reason === "unreachable" || payment.reason === "not-configured") {
        // Razorpay couldn't be asked. Don't lose a real customer's order — place
        // it, but flag it and don't mark it paid until someone checks Razorpay.
        paymentUnverified = true;
        console.error(`[checkout] Razorpay unreachable — order will be flagged, payment ${razorpayPaymentId}.`);
      } else {
        return NextResponse.json(
          {
            error:
              "We couldn't verify your payment. If money was deducted it will be refunded automatically.",
          },
          { status: 402 }
        );
      }
    }

    const wixClient = wixAdminClientServer();
    const contactDetails = splitName(fullName);

    const address = {
      country: "IN",
      addressLine1,
      ...(addressLine2 ? { addressLine2 } : {}),
      city,
      subdivision: normalizeIndiaSubdivision(state),
      postalCode,
    };

    const customFields: { title: string; value: string }[] = [
      { title: "Payment Method", value: paymentMethod === "COD" ? "Cash on Delivery" : "Prepaid (Razorpay)" },
      { title: "Customer Phone", value: phone },
      ...(razorpayPaymentId
        ? [{ title: "Razorpay Payment ID", value: razorpayPaymentId }]
        : []),
      ...(verifiedPaid != null
        ? [{ title: "Amount Paid (Razorpay)", value: `₹${verifiedPaid.toFixed(2)}` }]
        : []),
      ...(paymentUnverified
        ? [{ title: "Payment Check", value: "UNVERIFIED — confirm this payment in Razorpay before shipping" }]
        : []),
    ];

    let updatedCheckout = await wixClient.checkout.updateCheckout(
      checkoutId,
      {
        billingInfo: {
          address,
          contactDetails: { ...contactDetails, phone },
        },
        shippingInfo: {
          shippingDestination: {
            address,
            contactDetails: { ...contactDetails, phone },
          },
        },
        buyerInfo: { email },
        buyerNote:
          paymentMethod === "COD"
            ? `Payment: Cash on Delivery (COD). Phone: ${phone}. Pincode: ${postalCode}.`
            : `Payment: Prepaid (Razorpay). Phone: ${phone}. Pincode: ${postalCode}.${
                razorpayPaymentId ? ` Razorpay Payment ID: ${razorpayPaymentId}.` : ""
              }${verifiedPaid != null ? ` Amount paid via Razorpay: ₹${verifiedPaid.toFixed(2)}.` : ""}`,
        customFields,
      } as any
    );

    const shippingOptions = updatedCheckout?.shippingInfo?.carrierServiceOptions || [];
    if (shippingOptions.length > 0) {
      updatedCheckout = await wixClient.checkout.updateCheckout(
        checkoutId,
        {
          shippingInfo: {
            ...updatedCheckout.shippingInfo,
            selectedCarrierServiceOption: shippingOptions[0],
          },
        } as any
      );
    }

    const calculationErrors = updatedCheckout?.calculationErrors;
    const calculationErrorMessages = Array.from(new Set(flattenCalculationErrors(calculationErrors)));
    if (calculationErrorMessages.length > 0) {
      if (pendingPaymentClaim) await release(pendingPaymentClaim);
      pendingPaymentClaim = "";
      return NextResponse.json(
        {
          error: `Wix checkout has calculation errors: ${calculationErrorMessages.join("; ")}`,
          details: calculationErrors,
        },
        { status: 422 }
      );
    }

    // The payment must cover the Wix total minus the pay-online discount. A
    // shortfall (a tampered amount, or a price that changed mid-checkout) still
    // becomes an order — the customer did pay something — but it is flagged, gets
    // no silent discount, and is not marked fully paid.
    const checkoutTotal = Number((updatedCheckout as any)?.priceSummary?.total?.amount);
    const paymentShortfall =
      verifiedPaid != null &&
      Number.isFinite(checkoutTotal) &&
      verifiedPaid < checkoutTotal - PREPAID_DISCOUNT - 1;
    if (paymentShortfall) {
      console.error(
        `[checkout] PAYMENT SHORTFALL on checkout ${checkoutId}: paid ₹${verifiedPaid}, expected ₹${(
          checkoutTotal - PREPAID_DISCOUNT
        ).toFixed(2)} (payment ${razorpayPaymentId}).`
      );
      customFields.push({
        title: "Payment Check",
        value: `SHORTFALL — paid ₹${verifiedPaid!.toFixed(2)}, expected ₹${(checkoutTotal - PREPAID_DISCOUNT).toFixed(2)}. Do not ship before checking.`,
      });
    }

    // COD: the cash to collect (Wix total after coupons + the COD charge), stamped
    // now so the CRM/courier read the ₹49-inclusive figure race-proof — before the
    // fee's draft edit below commits.
    const codAmount =
      paymentMethod === "COD" && Number.isFinite(checkoutTotal) && checkoutTotal > 0
        ? (checkoutTotal + codCharge).toFixed(2)
        : "";
    if (codAmount) customFields.push({ title: "COD Amount to Collect", value: `₹${codAmount}` });

    // Seal the payment mode + amount to this checkout (see src/lib/crm/paymentSeal.js).
    // The order pipeline only believes "paid online" / "collect ₹X" when the seal
    // checks out, so fields a browser writes onto a Wix checkout count for nothing.
    // Underpaid or unverified prepaid orders get no seal → treated as COD for the
    // full Wix total until someone checks Razorpay.
    const seal =
      paymentMethod === "COD"
        ? codAmount
          ? makePaymentSeal({ checkoutId, mode: "COD", amount: codAmount })
          : ""
        : verifiedPaid != null && !paymentShortfall && !paymentClaimDegraded
          ? makePaymentSeal({ checkoutId, mode: "PREPAID", amount: verifiedPaid, paymentId: razorpayPaymentId })
          : "";
    if (seal) customFields.push({ title: "Payment Seal", value: seal });
    else console.warn(`[checkout] order from checkout ${checkoutId} goes UNSEALED (${paymentMethod}).`);

    try {
      updatedCheckout = await wixClient.checkout.updateCheckout(checkoutId, { customFields } as any);
    } catch (fieldErr) {
      // The order still goes through; unsealed it is treated as COD for the Wix total.
      console.error("[checkout] could not stamp the payment fields/seal on the order:", fieldErr);
    }

    const orderResult = await createOrderWithCouponFallback(wixClient, checkoutId);
    const orderId =
      (orderResult as any)?.orderId ||
      (orderResult as any)?.order?._id ||
      (orderResult as any)?._id;

    if (!orderId) {
      return NextResponse.json(
        { error: "Wix created the order but did not return an order ID." },
        { status: 502 }
      );
    }
    // The payment now belongs to this order for good.
    pendingPaymentClaim = "";

    // No reminder for a shopper who just ordered.
    await checkoutLeads.removeByPhone(phone);

    const approvedOrderResult = await (wixClient.orders as any).updateOrderStatus(
      orderId,
      "APPROVED"
    );

    // The total Wix computed for the order (already reflects any coupon or
    // automatic discount). This is the pre-prepaid-discount figure.
    const wixOrderTotal = Number(
      (updatedCheckout as any)?.priceSummary?.total?.amount ??
        (approvedOrderResult as any)?.order?.priceSummary?.total?.amount ??
        (orderResult as any)?.order?.priceSummary?.total?.amount
    );

    // For PREPAID orders the customer pays online via Razorpay, after the flat
    // "pay online" discount that Wix's coupon system can't represent (it stacks
    // on top of any coupon). To make the Wix order TOTAL equal what was actually
    // charged — so the admin amount, the My Orders total, and the email all show
    // the real figure — we apply that difference as a custom discount through a
    // draft-order edit, then commit it back onto this same order.
    //
    // This whole block is best-effort: if anything fails the original order is
    // untouched and we simply record the real amount paid (the order may then
    // show a small balance in the admin, but it is never blocked).
    let finalTotal = wixOrderTotal; // amount we record as paid
    let committedOrder: any = null;
    let discountApplied = false;
    let codChargeApplied = false;

    // For COD orders, add the delivery + handling charge as an ADDITIONAL FEE
    // (not a line item) via a draft-order edit, so the Wix order TOTAL — and
    // therefore the amount the courier collects — becomes subtotal + ₹49.
    //
    // Why a fee and not a custom line item: a second line item made the order
    // show "2 items" and get stuck on "Partially fulfilled" (the service item
    // never ships) and threw off the invoice quantity. An additional fee raises
    // the total without touching the product line items, so quantity/fulfilment
    // stay correct. Mirrors the prepaid draft-edit below (which subtracts via a
    // custom discount) — this one ADDS a fee.
    //
    // Best-effort: if the edit fails the underlying order is untouched. We still
    // record the intended total so the email/tracking match what the customer
    // agreed to, and log loudly so the Wix order can be corrected manually.
    if (paymentMethod === "COD" && codCharge > 0 && Number.isFinite(wixOrderTotal)) {
      try {
        const draftRes = await (wixClient.draftOrders as any).createDraftOrder({
          sourceOrderId: orderId,
        });
        const draftId =
          draftRes?.calculatedDraftOrder?.draftOrder?._id ||
          draftRes?.draftOrder?._id;
        if (!draftId) throw new Error("Draft order id missing from response.");

        await (wixClient.draftOrders as any).createCustomAdditionalFees(draftId, {
          customAdditionalFees: [
            {
              name: "Delivery + COD Charges",
              price: { amount: codCharge.toFixed(2) },
              applyToDraftOrder: true,
            },
          ],
        });

        const commitRes = await (wixClient.draftOrders as any).commitDraftOrder(
          draftId,
          {
            commitSettings: {
              sendNotificationsToBuyer: false,
              sendNotificationsToBusiness: false,
            },
            reason: "COD delivery & handling charge",
          }
        );

        committedOrder = commitRes?.orderAfterCommit || null;
        const committedTotal = committedOrder?.priceSummary?.total?.amount;
        finalTotal =
          committedTotal != null
            ? Number(committedTotal)
            : Number((wixOrderTotal + codCharge).toFixed(2));
        codChargeApplied = true;
      } catch (feeErr) {
        console.error(
          `COD charge (draft edit) FAILED for order ${orderId} — Wix order may ` +
            `still show the product-only total and must be corrected manually:`,
          feeErr
        );
        finalTotal = Number((wixOrderTotal + codCharge).toFixed(2));
      }
    }

    // Only a verified, complete payment earns the pay-online discount — at most
    // the gap between the Wix total and what Razorpay says was paid.
    if (paymentMethod === "PREPAID" && verifiedPaid != null && !paymentShortfall) {
      const amountPaid = verifiedPaid;
      if (
        Number.isFinite(wixOrderTotal) &&
        amountPaid > 0 &&
        amountPaid < wixOrderTotal
      ) {
        const discount = Number((wixOrderTotal - amountPaid).toFixed(2));
        try {
          const draftRes = await (wixClient.draftOrders as any).createDraftOrder({
            sourceOrderId: orderId,
          });
          const draftId =
            draftRes?.calculatedDraftOrder?.draftOrder?._id ||
            draftRes?.draftOrder?._id;
          if (!draftId) throw new Error("Draft order id missing from response.");

          await (wixClient.draftOrders as any).createCustomDiscounts(draftId, {
            discounts: [
              {
                priceAmount: { amount: discount.toFixed(2) },
                discountType: "GLOBAL",
                applyToDraftOrder: true,
                description: "Online payment discount",
              },
            ],
          });

          const commitRes = await (wixClient.draftOrders as any).commitDraftOrder(
            draftId,
            {
              commitSettings: {
                sendNotificationsToBuyer: false,
                sendNotificationsToBusiness: false,
              },
              reason: "Online payment (prepaid) discount",
            }
          );

          committedOrder = commitRes?.orderAfterCommit || null;
          const committedTotal =
            committedOrder?.priceSummary?.total?.amount;
          finalTotal =
            committedTotal != null ? Number(committedTotal) : amountPaid;
          discountApplied = true;
        } catch (discErr) {
          console.error("Prepaid discount (draft edit) failed:", discErr);
          finalTotal = amountPaid;
        }
      }
    }

    // Record the payment Razorpay confirmed. A shortfall records only what was
    // really paid, so the order shows the balance; an unverified payment records
    // nothing until someone checks Razorpay.
    let paymentMarkedPaid = false;
    if (paymentMethod === "PREPAID" && verifiedPaid != null) {
      const recordAmount = paymentShortfall ? verifiedPaid : finalTotal;
      try {
        if (Number.isFinite(recordAmount) && recordAmount > 0) {
          await (wixClient.orderTransactions as any).addPayments(orderId, [
            {
              amount: { amount: recordAmount.toFixed(2) },
              regularPaymentDetails: {
                offlinePayment: true,
                status: "APPROVED",
                paymentMethod: "Razorpay",
                providerTransactionId: razorpayPaymentId,
              },
            },
          ]);
          paymentMarkedPaid = !paymentShortfall;
        } else {
          console.warn(
            "Prepaid order: could not resolve a total to mark as paid for order",
            orderId
          );
        }
      } catch (payErr) {
        // Don't fail the whole request — the order exists and the payment was
        // genuinely taken. Surface it in logs so it can be marked paid manually.
        console.error("Failed to mark prepaid Wix order as paid:", payErr);
      }
    }

    // Send our own branded confirmation email (correct amount + payment status).
    // Wix's automatic order email should be turned off in the dashboard so the
    // customer doesn't also receive the misleading "pay cash to courier" one.
    try {
      // The create/approve API responses frequently OMIT the sequential Wix
      // order `number` (they return the GUID only), which is why the email used
      // to show a random id like "#85de1583" (a GUID slice) instead of the real
      // order number. Fetch the fully-materialized order — that carries `.number`
      // (the same value shown in My Orders + the Wix dashboard).
      // Re-fetch the materialized order to get its sequential `number`. This can
      // fail two ways right after checkout: the read can throw transiently, or a
      // just-created order isn't yet readable (read-after-write lag) so `number`
      // comes back empty. Retry a few times before giving up — otherwise the
      // email falls back to a GUID slice like "#8f5a6030".
      let fetchedOrder: any = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const o = await (wixClient.orders as any).getOrder(orderId);
          if (o) {
            fetchedOrder = o;
            const n = o.number;
            // Got the real sequential number — stop retrying.
            if (n != null && String(n).trim() !== "" && String(n).trim() !== "0") {
              break;
            }
          }
        } catch (fetchErr) {
          console.warn(
            `[checkout] getOrder for number failed (attempt ${attempt + 1}/4):`,
            (fetchErr as any)?.message || fetchErr
          );
        }
        // Brief backoff before retrying — give Wix a moment to materialize the order.
        if (attempt < 3) await new Promise((r) => setTimeout(r, 500));
      }
      const finalOrder =
        committedOrder ||
        fetchedOrder ||
        (approvedOrderResult as any)?.order ||
        (orderResult as any)?.order;
      const emailAmount = Number.isFinite(finalTotal)
        ? finalTotal
        : wixOrderTotal;
      const items = ((finalOrder?.lineItems as any[]) || []).map((li) => ({
        name:
          li?.productName?.original ||
          li?.productName?.translated ||
          "Item",
        quantity: Number(li?.quantity) || 1,
        sku: li?.physicalProperties?.sku || li?.catalogReference?.options?.sku || undefined,
        options: ((li?.descriptionLines as any[]) || [])
          .map((dl) => ({
            name: dl?.name?.original || dl?.name?.translated || "",
            value:
              dl?.colorInfo?.original ||
              dl?.colorInfo?.translated ||
              dl?.plainText?.original ||
              dl?.plainText?.translated ||
              "",
          }))
          .filter((o) => o.name && o.value),
        unitPrice: li?.price?.amount || undefined,
        lineTotal:
          li?.totalPriceAfterTax?.amount ||
          li?.totalPriceBeforeTax?.amount ||
          li?.price?.amount ||
          undefined,
        image: li?.image || undefined,
      }));
      // Prefer the freshly-fetched order's number (most reliable), then any
      // number the create/approve/commit responses happened to include.
      const rawOrderNumber = fetchedOrder?.number ?? finalOrder?.number;
      const hasValidOrderNumber =
        rawOrderNumber != null &&
        String(rawOrderNumber).trim() !== "" &&
        String(rawOrderNumber).trim() !== "0";
      const orderNumber = hasValidOrderNumber
        ? `#${rawOrderNumber}`
        : `#${String(orderId).slice(-8)}`;
      if (!hasValidOrderNumber) {
        console.warn(
          `[checkout] No Wix order number resolved for order ${orderId} after retries; ` +
            `email will show the GUID fallback ${orderNumber}.`
        );
      }

      const ps = (finalOrder?.priceSummary as any) || {};
      const summary = {
        subtotal: ps?.subtotal?.amount || undefined,
        shipping: ps?.shipping?.amount || undefined,
        tax: ps?.tax?.amount || undefined,
        discount: ps?.discount?.amount || undefined,
        total:
          ps?.total?.amount ||
          (Number.isFinite(emailAmount) ? emailAmount.toFixed(2) : undefined),
      };

      const createdDate =
        finalOrder?._createdDate || finalOrder?.createdDate || Date.now();
      const orderDate = new Date(createdDate).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      await sendOrderConfirmationEmail({
        to: email,
        customerName: fullName,
        orderNumber,
        orderDate,
        paymentMethod,
        amount: (Number.isFinite(emailAmount) ? emailAmount : 0).toFixed(2),
        razorpayPaymentId: razorpayPaymentId || undefined,
        items,
        summary,
        address: {
          line1: addressLine1,
          city,
          state,
          postalCode,
        },
        phone,
      });
    } catch (emailErr) {
      console.error("Order confirmation email step failed:", emailErr);
    }

    // Meta Purchase — server-side CAPI fire, using the same deterministic
    // event_id the browser used (`purchase_<orderId>`) so Meta dedupes the two
    // signals. Fire-and-forget: it must never block or fail the order response.
    try {
      const finalOrder =
        committedOrder ||
        (approvedOrderResult as any)?.order ||
        (orderResult as any)?.order;
      const purchaseValue = Number.isFinite(finalTotal)
        ? finalTotal
        : Number.isFinite(wixOrderTotal)
        ? wixOrderTotal
        : undefined;
      // Meta's catalog keys on the product SLUG (its Content ID), not the Wix
      // GUID. Derive the slug from each line item's product-page URL so the
      // server Purchase matches a catalog product; fall back to the GUID.
      const capiContentIds = (((finalOrder?.lineItems as any[]) || [])
        .map((li) => {
          const guid =
            li?.catalogReference?.catalogItemId ||
            li?.productId ||
            li?.catalogReference?.appId;
          return slugFromUrl(li?.url) || guid;
        })
        .filter(Boolean) as string[]);

      const cookieHeader = req.headers.get("cookie") || "";
      // Meta's _fbc / _fbp cookies must be forwarded to the Conversions API
      // byte-for-byte. decodeURIComponent() would rewrite the embedded fbclid,
      // which Meta flags as "modified fbclid value in fbc" and tanks match
      // quality — so read these two RAW (see src/lib/metaFbc.ts).
      const fbp = readCookieRaw(cookieHeader, "_fbp");
      const fbc = readCookieRaw(cookieHeader, "_fbc");
      const userAgent = req.headers.get("user-agent") || undefined;
      const forwardedFor = req.headers.get("x-forwarded-for") || "";
      const clientIp =
        forwardedFor.split(",")[0].trim() ||
        req.headers.get("x-real-ip") ||
        undefined;

      if (!marketingConsent)
        console.log("[capi] Purchase not sent — buyer declined marketing cookies.");
      else void sendServerCapi({
        eventName: "Purchase",
        eventId: `purchase_${orderId}`,
        eventSourceUrl: req.headers.get("referer") || undefined,
        fbp,
        fbc,
        clientIp,
        userAgent,
        userData: {
          email,
          phone,
          firstName: contactDetails.firstName,
          lastName: contactDetails.lastName,
          city,
          state,
          zip: postalCode,
          country: "IN",
        },
        customData: {
          value: purchaseValue,
          currency: "INR",
          content_ids: capiContentIds,
          content_type: "product",
          transaction_id: orderId,
        },
      }).catch((err) => {
        console.error("Server-side Purchase CAPI failed:", err);
      });
    } catch (capiErr) {
      console.error("Server-side Purchase CAPI prep failed:", capiErr);
    }

    return NextResponse.json({
      checkoutId,
      orderId,
      paymentMarkedPaid,
      discountApplied,
      codChargeApplied,
      finalTotal: Number.isFinite(finalTotal) ? finalTotal : undefined,
      order: committedOrder || approvedOrderResult?.order || (orderResult as any)?.order,
    });
  } catch (err: any) {
    // No order was created — free the payment so the shopper can retry with it.
    if (pendingPaymentClaim) await release(pendingPaymentClaim);

    // Log the FULL Wix error so the exact rule/code is visible in Vercel logs.
    console.error("Wix checkout finalization failed:", err);
    try {
      console.error(
        "Wix error details:",
        JSON.stringify(err?.details ?? err, null, 2)
      );
    } catch {}

    // Surface the Wix applicationError CODE alongside its description so a failed
    // checkout tells us which rule fired (e.g. a minimum-order rule) instead of
    // just an opaque amount.
    const code = err?.details?.applicationError?.code;
    const description = getWixErrorMessage(err);
    const message = code ? `${code}: ${description}` : description;
    return NextResponse.json(
      { error: message, code: code ?? null, details: err?.details ?? null },
      { status: 500 }
    );
  }
}
