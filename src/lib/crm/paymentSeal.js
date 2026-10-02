// A tamper-proof stamp our checkout server puts on every order it creates.
//
// The order pipeline (webhook → dashboard → courier → WhatsApp) decides "paid
// online, collect ₹0" vs "collect ₹X cash" from the order's custom fields. But
// a shopper's browser can write custom fields on a Wix checkout itself, and the
// COD amount used to come straight from the browser. So those fields are only
// trusted when they carry this seal: an HMAC, keyed with a server-only secret,
// over the order's own checkoutId + payment mode + amount (+ Razorpay payment
// id). It can't be forged, and it can't be copied onto another order because
// every order has its own checkoutId.

import crypto from "crypto";

const VERSION = "v1";

const sealKey = () => String(process.env.PAYMENT_SEAL_SECRET || process.env.RAZORPAY_KEY_SECRET || "").trim();

/**
 * @param {{ checkoutId: string, mode: "PREPAID" | "COD", amount: number | string, paymentId?: string }} f
 * @returns {string} the seal, or "" when it can't be made (no secret / no checkoutId)
 */
function makePaymentSeal({ checkoutId, mode, amount, paymentId = "" }) {
  const key = sealKey();
  const amt = Number(String(amount ?? "").replace(/[^\d.]/g, ""));
  if (!key || !checkoutId || !mode || !Number.isFinite(amt)) return "";
  const digest = crypto
    .createHmac("sha256", key)
    .update([VERSION, String(checkoutId), mode, amt.toFixed(2), String(paymentId || "")].join("|"))
    .digest("hex")
    .slice(0, 40);
  return `${VERSION}.${digest}`;
}

/** True only when `seal` is exactly what makePaymentSeal gives for these fields. */
function verifyPaymentSeal(seal, fields) {
  const expected = makePaymentSeal(fields);
  if (!expected || typeof seal !== "string" || seal.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(seal), Buffer.from(expected));
}

export { makePaymentSeal, verifyPaymentSeal };
