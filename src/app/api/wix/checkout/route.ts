import { NextResponse } from "next/server";
import { wixAdminClientServer } from "@/lib/wixAdminClientServer";
import { sendOrderConfirmationEmail } from "@/lib/orderEmail";

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
  razorpayAmount?: string;
};

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const checkoutId = normalizeCheckoutId(body?.checkoutId);
    const details = body?.details as Partial<CheckoutAddressPayload> | undefined;

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
    const razorpayAmount = normalizeText(details?.razorpayAmount);

    if (!email || !fullName || !phone || !addressLine1 || !city || !state || !postalCode) {
      return NextResponse.json(
        { error: "Missing checkout contact or shipping details." },
        { status: 400 }
      );
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
              }${razorpayAmount ? ` Amount paid via Razorpay: ₹${razorpayAmount}.` : ""}`,
        customFields: [
          { title: "Payment Method", value: paymentMethod === "COD" ? "Cash on Delivery" : "Prepaid (Razorpay)" },
          { title: "Customer Phone", value: phone },
          ...(razorpayPaymentId
            ? [{ title: "Razorpay Payment ID", value: razorpayPaymentId }]
            : []),
          ...(razorpayAmount
            ? [{ title: "Amount Paid (Razorpay)", value: `₹${razorpayAmount}` }]
            : []),
        ],
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
      return NextResponse.json(
        {
          error: `Wix checkout has calculation errors: ${calculationErrorMessages.join("; ")}`,
          details: calculationErrors,
        },
        { status: 422 }
      );
    }

    const orderResult = await wixClient.checkout.createOrder(checkoutId);
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

    const approvedOrderResult = await (wixClient.orders as any).updateOrderStatus(
      orderId,
      "APPROVED"
    );

    // The total Wix computed for the order (already reflects any coupon like
    // SHINE50). This is the pre-prepaid-discount figure.
    const wixOrderTotal = Number(
      (updatedCheckout as any)?.priceSummary?.total?.amount ??
        (approvedOrderResult as any)?.order?.priceSummary?.total?.amount ??
        (orderResult as any)?.order?.priceSummary?.total?.amount
    );

    // For PREPAID orders the customer pays online via Razorpay, after a flat ₹50
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

    if (paymentMethod === "PREPAID" && razorpayPaymentId) {
      const amountPaid = Number(razorpayAmount);
      if (
        Number.isFinite(amountPaid) &&
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

    // Record the payment so the order shows as paid for `finalTotal`.
    let paymentMarkedPaid = false;
    if (paymentMethod === "PREPAID" && razorpayPaymentId) {
      try {
        if (Number.isFinite(finalTotal) && finalTotal > 0) {
          await (wixClient.orderTransactions as any).addPayments(orderId, [
            {
              amount: { amount: finalTotal.toFixed(2) },
              regularPaymentDetails: {
                offlinePayment: true,
                status: "APPROVED",
                paymentMethod: "Razorpay",
                providerTransactionId: razorpayPaymentId,
              },
            },
          ]);
          paymentMarkedPaid = true;
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
      const finalOrder =
        committedOrder ||
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
      const orderNumber = finalOrder?.number
        ? `#${finalOrder.number}`
        : `#${String(orderId).slice(-8)}`;

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

    return NextResponse.json({
      checkoutId,
      orderId,
      paymentMarkedPaid,
      discountApplied,
      finalTotal: Number.isFinite(finalTotal) ? finalTotal : undefined,
      order: committedOrder || approvedOrderResult?.order || (orderResult as any)?.order,
    });
  } catch (err: any) {
    console.error("Wix checkout finalization failed:", err);
    return NextResponse.json({ error: getWixErrorMessage(err) }, { status: 500 });
  }
}
