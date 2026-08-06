// Admin BACKFILL / RESEND for order-status WhatsApp messages.
//
//   POST /api/admin/resend-status   (x-inbox-key: INBOX_SECRET)
//   { "items": [ { "number": "10216", "awb": "I81031938", "status": "dispatched" } ],
//     "force": true }
//   -> { ok, results: [{ number, sent, reason }] }
//
// Recovers each customer from Wix by order number (same as the Velocity webhook),
// then sends the dispatched / out-for-delivery / delivered template. Used to
// backfill orders whose real status event was missed, or to RE-SEND a corrected
// message (e.g. after fixing the tracking link / product image).
//
// `force:true` bypasses the KV dedupe claim (so a corrected message can be sent
// even though the first one already claimed the key). Without force it respects
// the claim (won't double-send). Protected by INBOX_SECRET — fail closed.

import { NextRequest, NextResponse } from "next/server";
import * as wix from "@/lib/crm/wix";
import * as notify from "@/lib/crm/notify";
import * as idempotency from "@/lib/crm/idempotency";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SENDERS: Record<string, { fn: (o: any) => Promise<any>; flag: string }> = {
  dispatched: { fn: notify.sendDispatched, flag: "wa_dispatched_sent" },
  out_for_delivery: { fn: notify.sendOutForDelivery, flag: "wa_wf2_sent" },
  delivered: { fn: notify.sendDelivered, flag: "wa_wf3_sent" },
};

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  if (!authConfigured()) {
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  }
  if (!authOk(body?.key ?? keyFromRequest(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const items: any[] = Array.isArray(body?.items) ? body.items : [];
  const force = body?.force === true;
  const results: any[] = [];

  for (const it of items) {
    const number = String(it?.number ?? "").trim();
    const statusKey = String(it?.status ?? "dispatched").trim();
    const awb = it?.awb ? String(it.awb) : "";
    const sender = SENDERS[statusKey];
    if (!number || !sender) {
      results.push({ number, sent: false, reason: "bad number/status" });
      continue;
    }

    const order = await wix.findOrderByNumber(number);
    if (!order) {
      results.push({ number, sent: false, reason: "no wix order" });
      continue;
    }
    if (awb && !order.awb) order.awb = awb;

    const key = `${sender.flag}:${order.orderId || order.orderGuid}`;
    if (!force) {
      const claim = await idempotency.claimOnce(key);
      if (!claim.claimed) {
        results.push({ number, sent: false, reason: "already sent (claimed)" });
        continue;
      }
    }

    const res = await sender.fn(order);
    if (res?.ok && !res?.dryRun) {
      if (statusKey === "delivered") {
        await wix.markDelivered(order.orderGuid || order.orderId, Date.now());
      }
      results.push({ number, sent: true, name: order.name, phone: order.phone });
    } else {
      if (!force) await idempotency.release(key);
      results.push({
        number,
        sent: false,
        reason: res?.dryRun ? "dry-run" : res?.error || res?.data?.error?.message || "send failed",
      });
    }
  }

  const sent = results.filter((r) => r.sent).length;
  return NextResponse.json({ ok: true, sent, total: items.length, results });
}
