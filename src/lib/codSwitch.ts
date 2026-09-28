import crypto from "crypto";
import Razorpay from "razorpay";
import { wixAdminClientServer } from "@/lib/wixAdminClientServer";
import { claimOnce } from "@/lib/crm/idempotency";
import * as ordersStore from "@/lib/crm/orders-store";
import { customFieldValue } from "@/lib/crm/wixOrder";
import { COD_CHARGE, COD_SWITCH_DISCOUNT_LABEL } from "@/lib/checkoutPricing";

// "Pay online after a COD order": the customer pays the order total minus the
// COD charge through Razorpay, and the Wix order is edited to match (charge
// waived, payment recorded). Everything — eligibility, the amount, the checks
// on the payment — is decided here on the server; the browser only drives the
// Razorpay popup.

/** A switch is only offered this soon after the order is placed. */
const SWITCH_WINDOW_MS = 48 * 60 * 60 * 1000;

export type CodSwitchQuote =
  | { eligible: true; orderGuid: string; orderNumber: string; codTotal: number; payNow: number }
  | { eligible: false; reason: string };

// Payment mode can only change while the order still waits in the dashboard for
// a courier pick. Outside HOLD mode the courier gets the order immediately and
// would still collect cash.
const holdMode = () => String(process.env.DASHBOARD_HOLD_ORDERS).trim().toLowerCase() === "true";

const razorpayClient = () => {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, instance: new Razorpay({ key_id: keyId, key_secret: keySecret }) };
};

// The ₹49 is an additional fee on new orders; older orders carry it as a
// SERVICE line item instead.
const hasCodChargeLine = (order: any) =>
  (order?.additionalFees || []).some((fee: any) =>
    String(fee?.name || fee?.translatedName || "").toLowerCase().includes("cod charge")
  ) ||
  (order?.lineItems || []).some((li: any) =>
    String(li?.productName?.original || li?.productName?.translated || "")
      .toLowerCase()
      .includes("cod charge")
  );

export async function quoteCodSwitch(orderGuid: string): Promise<CodSwitchQuote> {
  try {
    if (!holdMode()) return { eligible: false, reason: "courier-already-assigned" };

    const order: any = await (wixAdminClientServer().orders as any).getOrder(orderGuid);
    if (!order) return { eligible: false, reason: "not-found" };

    const method = String(customFieldValue(order, "payment method") || "");
    if (!/cash on delivery/i.test(method)) return { eligible: false, reason: "not-cod" };
    if (String(order.status).toUpperCase() === "CANCELED") return { eligible: false, reason: "cancelled" };
    if (String(order.paymentStatus).toUpperCase() === "PAID") return { eligible: false, reason: "already-paid" };
    if (!hasCodChargeLine(order)) return { eligible: false, reason: "no-cod-charge" };

    const createdAt = Date.parse(order._createdDate || order.createdDate || "");
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > SWITCH_WINDOW_MS) {
      return { eligible: false, reason: "too-late" };
    }

    // Too late once a courier has been picked in the dashboard. If the dashboard
    // store isn't reachable we can't tell, so we don't offer the switch.
    const orderNumber = String(order.number ?? "");
    if (!ordersStore.isConfigured()) return { eligible: false, reason: "store-unavailable" };
    const stored: any = orderNumber ? await ordersStore.getOrder(orderNumber) : null;
    if (stored && (stored.courier || stored.awb)) return { eligible: false, reason: "courier-already-assigned" };

    const codTotal = Number(order.priceSummary?.total?.amount);
    if (!Number.isFinite(codTotal) || codTotal <= COD_CHARGE) return { eligible: false, reason: "bad-total" };

    return {
      eligible: true,
      orderGuid,
      orderNumber,
      codTotal,
      payNow: Number((codTotal - COD_CHARGE).toFixed(2)),
    };
  } catch (err) {
    console.error("[cod-switch] quote failed:", err);
    return { eligible: false, reason: "error" };
  }
}

export async function createCodSwitchPayment(orderGuid: string) {
  const quote = await quoteCodSwitch(orderGuid);
  if (!quote.eligible) return { ok: false as const, error: quote.reason };
  const rz = razorpayClient();
  if (!rz) return { ok: false as const, error: "Razorpay credentials not configured" };

  const rzOrder = await rz.instance.orders.create({
    amount: Math.round(quote.payNow * 100),
    currency: "INR",
    receipt: `codswitch_${quote.orderNumber || Date.now()}`.slice(0, 40),
    notes: { wixOrderId: orderGuid, purpose: "cod-switch" },
  });

  return {
    ok: true as const,
    order_id: rzOrder.id,
    amount: rzOrder.amount,
    currency: rzOrder.currency,
    key_id: rz.keyId,
  };
}

type ConfirmInput = {
  orderGuid: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
};

export async function confirmCodSwitch(input: ConfirmInput) {
  const { orderGuid, razorpayOrderId, razorpayPaymentId, razorpaySignature } = input;
  const rz = razorpayClient();
  if (!rz) return { ok: false as const, error: "Razorpay credentials not configured" };

  // 1. Genuine Razorpay callback.
  const expected = crypto
    .createHmac("sha256", rz.keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(String(razorpaySignature));
  if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    return { ok: false as const, error: "Payment signature mismatch" };
  }

  // 2. The Razorpay order was created for THIS Wix order, and the payment covers it in full.
  const rzOrder: any = await rz.instance.orders.fetch(razorpayOrderId);
  if (rzOrder?.notes?.wixOrderId !== orderGuid || rzOrder?.notes?.purpose !== "cod-switch") {
    return { ok: false as const, error: "Payment does not belong to this order" };
  }
  const payment: any = await rz.instance.payments.fetch(razorpayPaymentId);
  if (
    payment?.order_id !== razorpayOrderId ||
    !["captured", "authorized"].includes(String(payment?.status)) ||
    Number(payment?.amount) !== Number(rzOrder.amount)
  ) {
    return { ok: false as const, error: "Payment is not complete" };
  }
  const paid = Number(rzOrder.amount) / 100;

  // 3. Still switchable (a repeat confirm for an already-switched order is fine).
  const quote = await quoteCodSwitch(orderGuid);
  if (!quote.eligible) {
    if (quote.reason === "already-paid") return { ok: true as const, paid, alreadyDone: true };
    console.error(
      `[cod-switch] payment ${razorpayPaymentId} captured but order ${orderGuid} is no longer switchable (${quote.reason}) — refund or update manually.`
    );
    return { ok: false as const, error: "Order can no longer be switched to online payment" };
  }
  if (Math.abs(paid - quote.payNow) > 0.5) {
    console.error(`[cod-switch] amount mismatch on ${orderGuid}: paid ${paid}, expected ${quote.payNow}`);
    return { ok: false as const, error: "Paid amount does not match the order" };
  }
  // One payment pays for one order — shared with the checkout route's claim.
  const claim = await claimOnce(`rzp_payment_used:${razorpayPaymentId}`, 60 * 60 * 24 * 180);
  if (!claim.claimed) return { ok: false as const, error: "This payment has already been used" };

  const wix = wixAdminClientServer();

  // 4. Waive the COD charge on the Wix order (same draft-edit path checkout uses).
  try {
    const draftRes: any = await (wix.draftOrders as any).createDraftOrder({ sourceOrderId: orderGuid });
    const draftId = draftRes?.calculatedDraftOrder?.draftOrder?._id || draftRes?.draftOrder?._id;
    if (!draftId) throw new Error("Draft order id missing from response.");
    await (wix.draftOrders as any).createCustomDiscounts(draftId, {
      discounts: [
        {
          priceAmount: { amount: COD_CHARGE.toFixed(2) },
          discountType: "GLOBAL",
          applyToDraftOrder: true,
          description: COD_SWITCH_DISCOUNT_LABEL,
        },
      ],
    });
    await (wix.draftOrders as any).commitDraftOrder(draftId, {
      commitSettings: { sendNotificationsToBuyer: false, sendNotificationsToBusiness: false },
      reason: COD_SWITCH_DISCOUNT_LABEL,
    });
  } catch (err) {
    console.error(`[cod-switch] waiving COD charge FAILED for ${orderGuid} (payment ${razorpayPaymentId}):`, err);
    return { ok: false as const, error: "Payment received, but the order could not be updated yet" };
  }

  // 5. Record the payment so the order shows as paid.
  try {
    await (wix.orderTransactions as any).addPayments(orderGuid, [
      {
        amount: { amount: paid.toFixed(2) },
        regularPaymentDetails: {
          offlinePayment: true,
          status: "APPROVED",
          paymentMethod: "Razorpay",
          providerTransactionId: razorpayPaymentId,
        },
      },
    ]);
  } catch (err) {
    console.error(`[cod-switch] marking ${orderGuid} paid FAILED (payment ${razorpayPaymentId}):`, err);
  }

  // 6. Dashboard: the courier picked later must not collect cash.
  if (quote.orderNumber) {
    await ordersStore.updateOrder(quote.orderNumber, { paymentMode: "PREPAID", sellingPrice: paid });
  }

  return { ok: true as const, paid };
}
