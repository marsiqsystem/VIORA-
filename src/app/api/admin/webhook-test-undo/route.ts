// TEMP admin route — undo the side effects of a courier-webhook that fired for an
// order (e.g. a test "Delivered" event sent to a real order): dequeue its review
// and release the once-only WhatsApp claims so a later REAL status update sends
// the correct message again. The already-sent WhatsApp itself cannot be recalled.
//
//   POST /api/admin/webhook-test-undo   (x-inbox-key: INBOX_SECRET, or {key})
//     body: { "number": "10312" }
//
// DELETE this route after use.

import { NextRequest, NextResponse } from "next/server";
import * as reviewQueue from "@/lib/crm/reviewQueue";
import { release } from "@/lib/crm/idempotency";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  if (!authOk(body?.key ?? keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const number = String(body?.number || "").trim();
  if (!number) return NextResponse.json({ ok: false, error: "number required" }, { status: 400 });

  const dq = await reviewQueue.dequeue(number);
  await release(`wa_wf3_sent:${number}`);
  await release(`wa_wf2_sent:${number}`);
  await release(`wa_dispatched_sent:${number}`);

  return NextResponse.json({
    ok: true,
    number,
    dequeued: dq,
    released: ["wa_wf3_sent", "wa_wf2_sent", "wa_dispatched_sent"].map((k) => `${k}:${number}`),
    note: "Review dequeued + WhatsApp claims released. The already-sent delivered message cannot be recalled.",
  });
}
