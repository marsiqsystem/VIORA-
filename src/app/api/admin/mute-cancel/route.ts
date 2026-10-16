// TEMP admin route — pre-claim (or release) the "order cancelled" dedupe key so a
// customer is NOT messaged when an order's old shipment is cancelled/RTO'd during a
// manual re-assignment. Shares the SAME KV key the webhooks use
// (wa_cancelled_sent:<order>), so once claimed here, dispatchCancellationOnce() in
// /api/velocity-webhook and /api/courier-webhook will skip the WhatsApp (30-day TTL).
//
//   POST /api/admin/mute-cancel        (x-inbox-key: INBOX_SECRET, or {key})
//
// Body:
//   { "numbers":["10843","10850"] }                 -> MUTE (claim) those orders.
//   { "numbers":[...], "action":"unmute" }           -> UNMUTE (release) — a later
//                                                        real cancel CAN message again.
//   { "numbers":[...], "dryRun":true }               -> report only, change nothing.
//
// Protected by INBOX_SECRET — fail closed. DELETE this route after the re-assignment.

import { NextRequest, NextResponse } from "next/server";
import { claimOnce, release } from "@/lib/crm/idempotency";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KEY = (n: string) => `wa_cancelled_sent:${n}`;

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (!authConfigured())
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(body?.key ?? keyFromRequest(req)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const numbers: string[] = Array.isArray(body?.numbers)
    ? body.numbers.map((n: any) => String(n).trim()).filter(Boolean)
    : [];
  if (!numbers.length)
    return NextResponse.json({ ok: false, error: "numbers[] required" }, { status: 400 });

  const action = body?.action === "unmute" ? "unmute" : "mute";
  const dryRun = body?.dryRun === true;

  const results: any[] = [];
  for (const n of numbers) {
    const key = KEY(n);
    if (dryRun) {
      results.push({ number: n, key, wouldDo: action });
      continue;
    }
    if (action === "unmute") {
      await release(key);
      results.push({ number: n, unmuted: true });
    } else {
      // claimOnce returns claimed:true the FIRST time (now muted); claimed:false
      // means it was already muted/sent — either way the customer won't be messaged.
      const r = await claimOnce(key);
      results.push({ number: n, muted: true, newlyClaimed: r.claimed, degraded: r.degraded });
    }
  }

  return NextResponse.json({
    ok: true,
    action,
    mode: dryRun ? "dry-run" : "applied",
    total: results.length,
    note:
      action === "mute"
        ? "cancel/RTO WhatsApp suppressed for these orders for ~30 days"
        : "mute removed; a real cancel can message again",
    results,
  });
}
