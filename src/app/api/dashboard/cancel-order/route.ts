// Cancel an order straight from the dashboard — no need to push it to a courier
// first.
//
//   POST /api/dashboard/cancel-order?key=<INBOX_SECRET>
//     body: { orderId }
//   -> { ok, order, messaged, note? }
//
// What it does:
//   1. Marks the order "cancelled" in the dashboard store (drops it out of
//      "Needs courier"; the customer's on-site tracking then shows Cancelled).
//   2. Sends the customer the cancellation WhatsApp — ONCE (shares the same
//      `wa_cancelled_sent:<orderId>` KV claim the courier/Wix cancel webhooks
//      use, so it can never double-message).
//   3. Best-effort: stamps a `cancelled_at` flag on the Wix order.
//
// If the order already has an AWB (already handed to a courier), we still cancel
// + message, and return a note reminding the operator to cancel that shipment in
// the courier's own dashboard (there's no courier cancel API wired yet).

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";
import { dispatchCancellationOnce } from "@/lib/crm/cancel";
import * as wix from "@/lib/crm/wix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TERMINAL = new Set(["cancelled", "canceled", "delivered", "rto"]);

export async function POST(req: NextRequest) {
  if (!authConfigured())
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad JSON" }, { status: 400 });
  }
  const orderId = String(body?.orderId || "").trim();
  if (!orderId)
    return NextResponse.json({ ok: false, error: "orderId required" }, { status: 400 });

  const order = await ordersStore.getOrder(orderId);
  if (!order)
    return NextResponse.json({ ok: false, error: "order not found in store" }, { status: 404 });

  const status = String(order.status || "").toLowerCase();
  if (TERMINAL.has(status)) {
    return NextResponse.json(
      { ok: false, error: `Order is already ${status} — nothing to cancel.` },
      { status: 409 }
    );
  }

  // 1) Mark cancelled in the store first so the operator + customer tracking
  //    reflect it immediately, even if the WhatsApp send is slow.
  await ordersStore.updateOrder(orderId, {
    status: "cancelled",
    statusAt: Date.now(),
  });

  // 2) Message the customer exactly once (shared idempotency key).
  const dispatch = await dispatchCancellationOnce({
    orderId: order.orderId,
    phone: order.phone,
    name: order.name,
    product: order.product || order.dCode,
    amount: order.sellingPrice,
    paymentMode: order.paymentMode,
  });

  // 3) Best-effort: stamp a flag on the Wix order (keyed by the Wix GUID) so the
  //    cancellation is visible in Wix bookkeeping too. Never fatal — the store +
  //    WhatsApp are what matter operationally.
  if (order.orderGuid) {
    try {
      await wix.setFlag(order.orderGuid, "cancelled_via_dashboard");
    } catch {
      /* ignore — bookkeeping only */
    }
  }

  const updated = await ordersStore.getOrder(orderId);
  const note = order.awb
    ? `Order was already on ${order.courier || "a courier"} (AWB ${order.awb}). Cancel that shipment in the courier dashboard too — there's no courier cancel API wired yet.`
    : undefined;

  return NextResponse.json({
    ok: true,
    order: updated,
    messaged: dispatch.sent,
    messageNote: dispatch.sent ? undefined : dispatch.reason,
    note,
  });
}
