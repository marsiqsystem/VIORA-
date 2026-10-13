// Razorpay webhook — the server-side SAFETY NET for prepaid orders.
//
// WHY: a prepaid Wix order is normally created by the BROWSER right after the
// payment succeeds. If anything there fails (tab closed, network drop, a Wix
// hiccup) the money is already captured but no order exists — an "orphan"
// (money taken, nothing to ship). This webhook catches that: on
// `payment.captured` it rebuilds the order from the snapshot that /api/razorpay
// stored at order-creation time.
//
// SAFE AGAINST DOUBLE ORDERS, two ways:
//   1. Grace delay — the browser runs immediately and almost always finishes
//      first; when it does it DELETES the snapshot, so this webhook then finds
//      nothing to do.
//   2. Even in a race, /api/wix/checkout claims the Razorpay payment id
//      (`paymentUsedKey`) atomically and returns 409 if that payment already
//      made an order — so a given payment can only ever create ONE order.
//
// Configure in Razorpay Dashboard → Settings → Webhooks:
//   URL:    https://www.viorajewel.in/api/razorpay-webhook
//   Secret: must equal env RAZORPAY_WEBHOOK_SECRET
//   Event:  payment.captured
//
// Always returns 200 (except a bad signature → 401) so Razorpay doesn't hammer
// retries; real failures are logged and the snapshot is kept for the next retry.

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { wixAdminClientServer } from "@/lib/wixAdminClientServer";
import { getPending, markHandled } from "@/lib/crm/rzpPending";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Give the browser a head start to finish the normal flow (and delete the
// snapshot) before we step in. The webhook is only a fallback.
const GRACE_MS = 12_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  try {
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature || ""));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[rzp-webhook] RAZORPAY_WEBHOOK_SECRET not set — ignoring.");
    return NextResponse.json({ ok: false, error: "not configured" }, { status: 200 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";
  if (!verifySignature(raw, signature, secret)) {
    console.warn("[rzp-webhook] bad signature — rejected.");
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let event: any = {};
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparseable" }, { status: 200 });
  }

  if (event?.event !== "payment.captured") {
    return NextResponse.json({ ok: true, ignored: event?.event || "unknown" }, { status: 200 });
  }

  const payment = event?.payload?.payment?.entity || {};
  const orderId = String(payment.order_id || "").trim();
  const paymentId = String(payment.id || "").trim();
  const amount = Number(payment.amount || 0) / 100;
  const contact = String(payment.contact || "");
  const emailFromPay = String(payment.email || "");

  if (!orderId || !paymentId) {
    return NextResponse.json({ ok: true, ignored: "no order/payment id" }, { status: 200 });
  }

  // 1) Quick pre-check: if the snapshot is already gone the browser handled it.
  if (!(await getPending(orderId))) {
    return NextResponse.json({ ok: true, handledBy: "client-or-missing" }, { status: 200 });
  }

  // 2) Let the browser finish first, then re-check.
  await sleep(GRACE_MS);
  const pending = await getPending(orderId);
  if (!pending) {
    return NextResponse.json({ ok: true, handledBy: "client" }, { status: 200 });
  }

  // 3) The browser did NOT complete the order — build it now from the snapshot.
  const items = Array.isArray(pending.items) ? pending.items : [];
  if (!items.length) {
    console.error(
      `[rzp-webhook] ORPHAN but no cart snapshot — manual recovery needed. ` +
        `payment=${paymentId} order=${orderId} amount=₹${amount} contact=${contact} email=${emailFromPay}`
    );
    return NextResponse.json({ ok: true, orphan: true, reason: "no items" }, { status: 200 });
  }

  try {
    const wixClient = wixAdminClientServer();
    const created: any = await wixClient.checkout.createCheckout({
      lineItems: items,
      channelType: "WEB",
    } as any);
    const checkoutId = created?._id;
    if (!checkoutId) throw new Error("Wix returned an empty checkoutId.");

    const origin =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      req.nextUrl.origin ||
      "https://www.viorajewel.in";

    const resp = await fetch(`${origin}/api/wix/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkoutId,
        marketingConsent: false,
        details: {
          ...(pending.details || {}),
          paymentMethod: "PREPAID",
          razorpayPaymentId: paymentId,
          razorpayAmount: String(amount.toFixed(2)),
          razorpayOrderId: orderId,
        },
      }),
    });

    if (resp.status === 409) {
      // The browser already used this payment for an order (it won the race).
      await markHandled(orderId);
      return NextResponse.json({ ok: true, handledBy: "client-race" }, { status: 200 });
    }

    const result = await resp.json().catch(() => ({}));
    if (!resp.ok || !result?.orderId) {
      // Keep the snapshot so Razorpay's next retry can try again.
      console.error(
        `[rzp-webhook] order create FAILED (will retry): payment=${paymentId} order=${orderId} ` +
          `status=${resp.status} err=${result?.error || "?"}`
      );
      return NextResponse.json({ ok: false, error: result?.error || "create failed" }, { status: 200 });
    }

    await markHandled(orderId);
    console.log(
      `[rzp-webhook] RECOVERED orphan → created Wix order #${result.order?.number || result.orderId} ` +
        `from payment ${paymentId} (₹${amount}).`
    );
    return NextResponse.json({ ok: true, created: result.orderId }, { status: 200 });
  } catch (e: any) {
    console.error(`[rzp-webhook] recovery error for payment ${paymentId}:`, e?.message || e);
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 200 });
  }
}
