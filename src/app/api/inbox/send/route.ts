// Inbox REPLY API — the operator sends a free-form text answer to a customer.
//
//   POST /api/inbox/send  { to, text }  (+ key header/body)
//     -> { ok, id, dryRun, withinWindow, error? }
//
// WhatsApp rule enforced here: a free-form text message is only allowed INSIDE
// the 24-hour customer-service window (the customer messaged us within 24h).
// Outside that window Meta rejects plain text (131047) — you must send an
// approved TEMPLATE instead. We reject early with a clear error so the UI can
// guide the operator instead of surfacing a raw Meta failure.
//
// Sending itself is unchanged — this reuses whatsapp.js sendText(). If the
// deployment is in dry-run (WHATSAPP_SEND_ENABLED!=true) the message is recorded
// as "pending" and dryRun:true is returned. Protected by INBOX_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { sendText } from "@/lib/crm/whatsapp";
import {
  getMessages,
  recordOutbound,
  authOk,
  authConfigured,
  keyFromRequest,
  normPhone,
} from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }

  if (!authConfigured()) {
    return NextResponse.json(
      { ok: false, error: "INBOX_SECRET not configured on the server." },
      { status: 503 }
    );
  }
  const key = body?.key ?? keyFromRequest(req);
  if (!authOk(key)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const to = normPhone(body?.to);
  const text = String(body?.text ?? "").trim();
  if (!to || !text) {
    return NextResponse.json({ ok: false, error: "Missing `to` or `text`." }, { status: 400 });
  }

  // 24-hour window check (server-side, from the stored conversation).
  const thread = await getMessages(to);
  if (!thread.withinWindow) {
    return NextResponse.json(
      {
        ok: false,
        withinWindow: false,
        error:
          "Outside the 24-hour window — WhatsApp blocks free-form text. Send an approved template instead.",
      },
      { status: 409 }
    );
  }

  const sent: any = await sendText({ to, body: text });
  const wamid = sent?.data?.messages?.[0]?.id;

  // Record it in the thread regardless of live/dry-run so the operator sees it.
  const rec = await recordOutbound({
    to,
    text,
    wamid,
    status: sent?.dryRun ? "pending" : "sent",
  });

  if (!sent?.ok) {
    return NextResponse.json(
      { ok: false, withinWindow: true, error: sent?.error || sent?.data || "Send failed." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    withinWindow: true,
    dryRun: !!sent?.dryRun,
    id: wamid || rec?.id,
  });
}
