// Admin: SUPPRESS the "order cancelled" WhatsApp for specific orders.
//
// Used when we ship a duplicate/wrong order and then delete/cancel it in Velocity
// (e.g. fixed the volumetric via a clone) — the customer must NOT receive a
// "cancelled" message for the copy. This pre-claims the SAME KV dedupe key that
// dispatchCancellationOnce checks, so when Velocity fires CANCELLED the webhook
// sees the key already present and skips the send. Everything else stays normal:
// only the cancel template is muted, and only for the listed orders. The claim
// self-expires (30-day TTL), so behaviour reverts on its own.
//
//   POST /api/admin/mute-cancel   (x-inbox-key: INBOX_SECRET, or { "key": ... })
//   { "numbers": ["10238","10228"] }
//   -> { ok, results:[{ number, keys, muted, alreadyMuted, failed }] }
//
// muted=true      -> we set the flag now (cancel message will be blocked)
// alreadyMuted    -> a flag was already present (still blocked)
// failed=true     -> KV was down/unconfigured; the flag did NOT persist — RETRY.

import { NextRequest, NextResponse } from "next/server";
import * as wix from "@/lib/crm/wix";
import * as idempotency from "@/lib/crm/idempotency";
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

  if (!authConfigured()) {
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  }
  if (!authOk(body?.key ?? keyFromRequest(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const numbers: string[] = Array.isArray(body?.numbers)
    ? body.numbers.map((n: any) => String(n).trim()).filter(Boolean)
    : [];
  const results: any[] = [];

  for (const number of numbers) {
    // Resolve to the SAME orderId the velocity-webhook computes, so the key we set
    // is byte-for-byte the one dispatchCancellationOnce will check. Also claim the
    // bare-number key as a belt-and-suspenders in case the Wix lookup differs at
    // webhook time (both are harmless if unused).
    const order = await wix.findOrderByNumber(number);
    const orderId = order?.orderId || number;
    const keys = Array.from(new Set([`wa_cancelled_sent:${orderId}`, `wa_cancelled_sent:${number}`]));

    let muted = false;
    let alreadyMuted = false;
    let failed = false;
    for (const key of keys) {
      const claim = await idempotency.claimOnce(key);
      if (claim.degraded) failed = true;
      else if (claim.claimed) muted = true;
      else alreadyMuted = true;
    }

    results.push({ number, orderId, keys, muted, alreadyMuted, failed });
  }

  return NextResponse.json({ ok: true, results });
}
