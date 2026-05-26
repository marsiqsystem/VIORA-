import { NextResponse } from "next/server";
import { wixAdminClientServer } from "@/lib/wixAdminClientServer";

type CheckoutAddressPayload = {
  email: string;
  fullName: string;
  phone: string;
  addressLine1: string;
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

    // For PREPAID orders the customer has already paid through Razorpay (and the
    // signature was verified before we got here), so record a payment on the Wix
    // order to flip its payment status to PAID. We record the Wix order total
    // (which already reflects any applied coupon like SHINE50) so the order shows
    // as fully paid with no phantom balance. The exact Razorpay amount can differ
    // by the automatic prepaid ₹50 — that and the payment ID are kept in the
    // order note/custom fields for reconciliation against the Razorpay dashboard.
    let paymentMarkedPaid = false;
    if (paymentMethod === "PREPAID" && razorpayPaymentId) {
      try {
        const totalAmount =
          (updatedCheckout as any)?.priceSummary?.total?.amount ??
          (approvedOrderResult as any)?.order?.priceSummary?.total?.amount ??
          (orderResult as any)?.order?.priceSummary?.total?.amount;

        if (totalAmount) {
          await (wixClient.orderTransactions as any).addPayments(orderId, [
            {
              amount: { amount: String(totalAmount) },
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

    return NextResponse.json({
      checkoutId,
      orderId,
      paymentMarkedPaid,
      order: approvedOrderResult?.order || (orderResult as any)?.order,
    });
  } catch (err: any) {
    console.error("Wix checkout finalization failed:", err);
    return NextResponse.json({ error: getWixErrorMessage(err) }, { status: 500 });
  }
}
