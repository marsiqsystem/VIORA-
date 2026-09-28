// POST /api/track { order, phone } -> { orderId } and a signed access cookie.
// Order tracking without an account: the order number plus the mobile number on
// the order. The response never says which of the two was wrong.

import { NextResponse, type NextRequest } from "next/server";
import { ORDER_ACCESS_COOKIE, orderAccessCookieOptions, withOrderAccess } from "@/lib/orderAccess";
import { findOrderByNumberAndPhone } from "@/lib/orderStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Brute-force brake per server instance: 8 tries per IP per 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRIES = 8;
const attempts = new Map<string, { count: number; since: number }>();

const tooMany = (ip: string) => {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now - entry.since > WINDOW_MS) {
    attempts.set(ip, { count: 1, since: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_TRIES;
};

const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const order = String(body?.order || "").replace(/\D/g, "").slice(0, 12);
  const phone = String(body?.phone || "");

  if (!order) return fail("Enter your order number — it's in your WhatsApp and email confirmation.");
  if (phone.replace(/\D/g, "").length < 10) return fail("Enter the 10-digit mobile number you ordered with.");

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  if (tooMany(ip)) return fail("Too many attempts. Please wait a few minutes, or WhatsApp us for help.", 429);

  const found = await findOrderByNumberAndPhone(order, phone);
  if (!found?._id) {
    return fail("We couldn't find an order with that number and mobile number. Please check both and try again.", 404);
  }

  const res = NextResponse.json({ orderId: String(found._id) }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(
    ORDER_ACCESS_COOKIE,
    withOrderAccess(req.cookies.get(ORDER_ACCESS_COOKIE)?.value, String(found._id)),
    orderAccessCookieOptions
  );
  return res;
}
