// TEMP admin route — backfill the "order cancelled" WhatsApp message to a list of
// Wix order numbers that were refused by the customer and have gone to RTO BEFORE
// the RTO->cancelled automation existed (so the webhook never messaged them).
//
//   POST /api/admin/send-cancelled        (x-inbox-key: INBOX_SECRET, or {key})
//
// Body:
//   { "numbers": ["10319","10247"] }              -> DRY RUN (default): resolves
//                                                    each order. Sends NOTHING.
//   { "numbers": [...], "send": true }            -> actually send to that set.
//   { "force": true }                             -> ignore the once-only claim.
//
// Uses the SAME dispatchCancellationOnce as the live webhooks, so it dedupes on the
// shared KV key wa_cancelled_sent:<order> — a customer is never messaged twice, and
// any later RTO webhook for the same order will skip.
//
// Protected by INBOX_SECRET — fail closed. DELETE this route after the backfill.

import { NextRequest, NextResponse } from "next/server";
import * as wix from "@/lib/crm/wix";
import { dispatchCancellationOnce } from "@/lib/crm/cancel";
import { release } from "@/lib/crm/idempotency";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  if (!authConfigured())
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  if (!authOk(body?.key ?? keyFromRequest(req)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const doSend = body?.send === true;
  const force = body?.force === true;
  const numbers: string[] = Array.isArray(body?.numbers)
    ? body.numbers.map((n: any) => String(n).trim()).filter(Boolean)
    : [];
  if (!numbers.length)
    return NextResponse.json({ ok: false, error: "numbers[] required (Wix order numbers)." }, { status: 400 });

  const results: any[] = [];
  for (const number of numbers) {
    const order = await wix.findOrderByNumber(number);
    if (!order) {
      results.push({ number, sent: false, reason: "no wix order" });
      continue;
    }
    if (!order.phone) {
      results.push({ number, name: order.name, sent: false, reason: "no phone" });
      continue;
    }
    if (!doSend) {
      results.push({
        number,
        name: order.name,
        phone: order.phone,
        product: order.product,
        amount: order.amount,
        paymentMode: order.paymentMode,
        wouldSend: true,
      });
      continue;
    }
    // force: drop any prior claim so the message re-sends.
    if (force) await release(`wa_cancelled_sent:${order.orderId}`);
    const r = await dispatchCancellationOnce(order);
    results.push({ number, name: order.name, phone: order.phone, ...r });
  }

  const sent = results.filter((r) => r.sent).length;
  return NextResponse.json({ ok: true, dryRun: !doSend, sent, total: numbers.length, results });
}
