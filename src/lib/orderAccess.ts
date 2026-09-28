import crypto from "crypto";

// Lets a buyer without an account open their own order page. After they prove
// ownership (the success page right after checkout, or order number + phone on
// /track), the order's GUID is added to a signed, HttpOnly cookie. /orders/[id]
// accepts a member who owns the order OR a valid entry in this cookie.

export const ORDER_ACCESS_COOKIE = "viora_orders";
export const ORDER_ACCESS_MAX_AGE = 60 * 60 * 24 * 60; // 60 days
const MAX_ORDERS = 10;

const secret = () => {
  const base = process.env.ORDER_ACCESS_SECRET || process.env.WIX_API_KEY || process.env.RAZORPAY_KEY_SECRET;
  if (!base) throw new Error("No secret available to sign order access.");
  return crypto.createHash("sha256").update(`viora-order-access:${base}`).digest();
};

const sign = (orderGuid: string) =>
  crypto.createHmac("sha256", secret()).update(orderGuid).digest("base64url").slice(0, 32);

const parse = (raw: string | undefined) =>
  String(raw || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [guid, sig] = entry.split(".");
      return { guid, sig };
    });

/** True when the cookie holds a correctly signed entry for this order. */
export const hasOrderAccess = (cookieValue: string | undefined, orderGuid: string) => {
  try {
    const expected = Buffer.from(sign(orderGuid));
    return parse(cookieValue).some(({ guid, sig }) => {
      if (guid !== orderGuid || !sig) return false;
      const got = Buffer.from(sig);
      return got.length === expected.length && crypto.timingSafeEqual(got, expected);
    });
  } catch {
    return false;
  }
};

/** New cookie value with this order added (newest first, capped). */
export const withOrderAccess = (cookieValue: string | undefined, orderGuid: string) => {
  const others = parse(cookieValue).filter(({ guid }) => guid !== orderGuid);
  return [`${orderGuid}.${sign(orderGuid)}`, ...others.map(({ guid, sig }) => `${guid}.${sig}`)]
    .slice(0, MAX_ORDERS)
    .join(",");
};

export const orderAccessCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: ORDER_ACCESS_MAX_AGE,
};

/** Digits-only last 10 of an Indian mobile, for comparing what the buyer typed with the order. */
export const lastTenDigits = (raw: unknown) => String(raw || "").replace(/\D/g, "").slice(-10);
