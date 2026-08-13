// TEMPORARY admin BACKFILL for review-request WhatsApp messages (Workflow 4).
//
//   POST /api/admin/send-reviews   (x-inbox-key: INBOX_SECRET)
//
// Body:
//   { "dryRun": true }                      -> preview ONLY. Lists every order in
//                                              the review queue that would get a
//                                              review message. Sends nothing,
//                                              claims nothing.
//   { "send": true }                         -> actually send to that same set.
//   { "numbers": ["10230","10231"], ... }    -> FALLBACK: send review to these Wix
//                                              order numbers explicitly (recovered
//                                              from Wix), for delivered orders that
//                                              never made it into the KV queue.
//   { "force": true }                        -> ignore the "already sent" claim
//                                              (numbers mode only). Default respects it.
//
// WHY THIS IS SAFE for the three requirements:
//   - "only Velocity-delivered"  -> the queue is populated ONLY by the Velocity
//                                    DELIVERED webhook (enqueueDelivered).
//   - "not RTO"                  -> an RTO/return dequeues the order, so RTO orders
//                                    are never in the queue.
//   - "not already sent"         -> claimReview (SET NX) blocks a second send; an
//                                    already-reviewed order is also dequeued.
//
// Protected by INBOX_SECRET — fail closed. DELETE this route after the backfill.

import { NextRequest, NextResponse } from "next/server";
import * as wix from "@/lib/crm/wix";
import * as notify from "@/lib/crm/notify";
import * as reviewQueue from "@/lib/crm/reviewQueue";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Send a review to one already-normalized order, honouring the once-only claim.
async function sendOne(order: any, force: boolean) {
  const id = String(order.orderId ?? order.orderGuid ?? "");
  if (!id) return { id, sent: false, reason: "no id" };

  if (!force) {
    const won = await reviewQueue.claimReview(id);
    if (!won) return { id, sent: false, name: order.name, reason: "already sent (claimed)" };
  }
  const res = await notify.sendReviewRequest(order);
  if (res?.ok && !res?.dryRun) {
    await reviewQueue.dequeue(id); // done — remove from queue so it isn't re-scanned
    return { id, sent: true, name: order.name, phone: order.phone };
  }
  if (!force) await reviewQueue.releaseClaim(id); // let a later retry try again
  return {
    id,
    sent: false,
    name: order.name,
    reason: res?.dryRun ? "dry-run (WHATSAPP_SEND_ENABLED off)" : res?.error || res?.data?.error?.message || "send failed",
  };
}

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

  const force = body?.force === true;
  const numbers: string[] = Array.isArray(body?.numbers) ? body.numbers.map((n: any) => String(n).trim()).filter(Boolean) : [];
  // Default to a DRY RUN unless the caller explicitly says send:true.
  const doSend = body?.send === true;

  // ---- FALLBACK MODE: explicit Wix order numbers -----------------------------
  if (numbers.length > 0) {
    const results: any[] = [];
    for (const number of numbers) {
      const order = await wix.findOrderByNumber(number);
      if (!order) {
        results.push({ number, sent: false, reason: "no wix order" });
        continue;
      }
      if (!doSend) {
        results.push({ number, name: order.name, phone: order.phone, product: order.product, wouldSend: true });
        continue;
      }
      results.push({ number, ...(await sendOne(order, force)) });
    }
    const sent = results.filter((r) => r.sent).length;
    return NextResponse.json({ ok: true, mode: "numbers", dryRun: !doSend, sent, total: numbers.length, results });
  }

  // ---- QUEUE MODE: everyone currently in the review queue --------------------
  // olderThanMs = 0 -> cutoff = now -> returns EVERY delivered order still queued
  // (any age), i.e. every Velocity-delivered, non-RTO, not-yet-reviewed order.
  const due = await reviewQueue.dueForReview(0);

  if (!doSend) {
    // Pure preview — no claim, no send.
    return NextResponse.json({
      ok: true,
      mode: "queue",
      dryRun: true,
      count: due.length,
      preview: due.map((o: any) => ({
        orderId: o.orderId,
        name: o.name,
        phone: o.phone,
        product: o.product,
        deliveredAt: o.deliveredAt ? new Date(o.deliveredAt).toISOString() : null,
      })),
    });
  }

  const results: any[] = [];
  for (const order of due) {
    results.push(await sendOne(order, false)); // queue mode always respects the claim
  }
  const sent = results.filter((r) => r.sent).length;
  return NextResponse.json({ ok: true, mode: "queue", dryRun: false, sent, total: due.length, results });
}
