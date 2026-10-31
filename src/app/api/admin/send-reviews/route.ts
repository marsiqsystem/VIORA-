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
import { beginReviewCapture } from "@/lib/crm/reviewCapture";
import { authOk, authConfigured, keyFromRequest, getMessages } from "@/lib/crm/inbox-store";

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
    // Open the WhatsApp review-capture window (no-op unless REVIEW_CAPTURE_ENABLED)
    // so the customer's in-chat rating/photo reply posts to the site + earns coins.
    try { await beginReviewCapture(order.waPhone || order.phone, id); } catch { /* best-effort */ }
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

  // ---- PROBE MODE: for each phone, has a review template actually gone out? ----
  // { probePhones:["918...","917..."] } -> { results:[{phone, sent, ts}] }. Reads
  // the outbound message log (source of truth: logOutbound only records a SUCCESS),
  // so a partial/timed-out batch can be reconciled without any Wix lookup. No send.
  const probePhones: string[] = Array.isArray(body?.probePhones)
    ? body.probePhones.map((n: any) => String(n).replace(/\D/g, "")).filter(Boolean)
    : [];
  if (probePhones.length) {
    // coinsOnly:true -> only the NEW coins review template counts as "sent"
    // (phrases unique to review_request_photo_v1), so customers who only ever got
    // the OLD util review request are treated as not-yet-sent for THIS campaign.
    const coinsOnly = body?.coinsOnly === true;
    const COINS_RE = /review there instead|land in your account|photo review = 75/i;
    const ANY_RE = /review there instead|land in your account|photo review = 75|feedback on this order|share a quick review/i;
    const RE = coinsOnly ? COINS_RE : ANY_RE;
    const results: any[] = [];
    for (const phone of probePhones) {
      let sent = false;
      let text: string | null = null;
      // latestReviewTs = the most recent outbound review-template send (any review
      // wording), normalized to ms. Recency is the reliable "sent in THIS campaign"
      // signal: the mirrored text can fall back to the hand-written copy when the
      // approved-body fetch is rate-limited mid-burst, so a text-only coinsOnly match
      // under-counts. A review-outbound dated today = the live coins template went out.
      let latestReviewTs = 0;
      const toMs = (t: any) => {
        const n = Number(t);
        if (!n) return 0;
        return n < 1e12 ? n * 1000 : n; // epoch seconds -> ms
      };
      try {
        const thread = await getMessages(phone);
        for (const m of thread.messages || []) {
          if (m.dir !== "out" || m.status === "failed") continue;
          const t = String(m.text || "");
          if (RE.test(t)) { sent = true; if (!text) text = t.slice(0, 50); }
          if (ANY_RE.test(t)) { const ms = toMs(m.ts); if (ms > latestReviewTs) latestReviewTs = ms; }
        }
      } catch { /* treat as not-sent */ }
      results.push({ phone, sent, latestReviewTs, text });
    }
    return NextResponse.json({ ok: true, mode: "probePhones", coinsOnly, total: results.length, sent: results.filter((r) => r.sent).length, results });
  }

  // Debug: read back the captured Meta failure reasons for a phone number.
  const readErrors = String(body?.readErrors ?? "").trim();
  if (readErrors) {
    const thread = await getMessages(readErrors);
    const failed = (thread.messages || [])
      .filter((m: any) => m.dir === "out" && m.status === "failed")
      .map((m: any) => ({ id: m.id, ts: m.ts, text: String(m.text || "").slice(0, 60), error: m.error || null }));
    return NextResponse.json({ ok: true, mode: "readErrors", phone: readErrors, failed });
  }

  const force = body?.force === true;
  const numbers: string[] = Array.isArray(body?.numbers) ? body.numbers.map((n: any) => String(n).trim()).filter(Boolean) : [];
  // Default to a DRY RUN unless the caller explicitly says send:true.
  const doSend = body?.send === true;

  // ---- TEST MODE: send the review template to ONE arbitrary number -----------
  // { testPhone:"918100460566", testName:"Mars", testOrderId:"11057",
  //   testProduct:"Rosa Blush Set", send:true }  -> fires the live review template
  // to that number so we can eyeball exactly what customers receive. Dry-run by
  // default. Does NOT touch the review queue or any claim.
  const testPhone = String(body?.testPhone ?? "").replace(/\D/g, "");
  if (testPhone) {
    const order: any = {
      orderId: String(body?.testOrderId ?? "TEST"),
      name: String(body?.testName ?? "there"),
      product: String(body?.testProduct ?? "Rosa Blush Set"),
      phone: testPhone,
    };
    if (!doSend) {
      return NextResponse.json({ ok: true, mode: "test", dryRun: true, wouldSend: order });
    }
    const res: any = await notify.sendReviewRequest(order);
    if (res?.ok && !res?.dryRun) {
      // Open the capture window so a reply to THIS test posts + earns coins.
      try { await beginReviewCapture(testPhone, order.orderId); } catch { /* best-effort */ }
    }
    return NextResponse.json({
      ok: res?.ok !== false,
      mode: "test",
      dryRun: false,
      to: testPhone,
      wamid: res?.data?.messages?.[0]?.id ?? null,
      error: res?.error || res?.data?.error || null,
    });
  }

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
