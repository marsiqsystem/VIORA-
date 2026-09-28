import Razorpay from "razorpay";

export type RazorpayPaymentCheck =
  | { ok: true; paid: number; razorpayOrderId?: string; notes: Record<string, unknown> }
  | { ok: false; reason: "not-configured" | "not-found" | "not-paid" | "unreachable" };

/**
 * Looks a payment up with Razorpay itself, so an order is never marked paid on
 * the browser's word. `paid` is in rupees. "unreachable" means Razorpay couldn't
 * be asked (network/outage) — callers should not treat that as proof of payment.
 */
export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPaymentCheck> {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return { ok: false, reason: "not-configured" };
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) return { ok: false, reason: "not-found" };

  try {
    const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const payment: any = await instance.payments.fetch(paymentId);
    if (!["captured", "authorized"].includes(String(payment?.status))) {
      return { ok: false, reason: "not-paid" };
    }
    return {
      ok: true,
      paid: Number(payment.amount) / 100,
      razorpayOrderId: payment.order_id || undefined,
      notes: (payment.notes as Record<string, unknown>) || {},
    };
  } catch (err: any) {
    const status = Number(err?.statusCode);
    if (status === 400 || status === 404) return { ok: false, reason: "not-found" };
    console.error("[razorpay] payment lookup failed:", err?.error || err?.message || err);
    return { ok: false, reason: "unreachable" };
  }
}
