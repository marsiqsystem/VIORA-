// Inbox READ API — feeds the /inbox dashboard.
//
//   GET  /api/inbox/conversations?key=SECRET            -> { ok, live, conversations: [...] }
//   GET  /api/inbox/conversations?key=SECRET&phone=91.. -> { ok, phone, name, withinWindow, messages: [...] }
//   POST /api/inbox/conversations  { phone, markRead:true } (+ key header/body) -> { ok }
//
// Protected by INBOX_SECRET (fail-closed): these responses contain private
// customer chats, so an unset/incorrect passcode is rejected. The passcode is
// read from the `x-inbox-key` header or a `?key=` query param.

import { NextRequest, NextResponse } from "next/server";
import {
  getConversations,
  getMessages,
  markRead,
  authOk,
  authConfigured,
  keyFromRequest,
  isConfigured,
} from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(req: NextRequest, providedKey?: string) {
  if (!authConfigured()) {
    return NextResponse.json(
      { ok: false, error: "INBOX_SECRET not configured on the server." },
      { status: 503 }
    );
  }
  const key = providedKey ?? keyFromRequest(req);
  if (!authOk(key)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;

  const phone = req.nextUrl.searchParams.get("phone");
  if (phone) {
    const thread = await getMessages(phone);
    return NextResponse.json({ ok: true, live: isConfigured(), ...thread });
  }

  const conversations = await getConversations(100);
  return NextResponse.json({ ok: true, live: isConfigured(), conversations });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const denied = guard(req, body?.key);
  if (denied) return denied;

  if (body?.markRead && body?.phone) {
    const res = await markRead(body.phone);
    return NextResponse.json({ ok: !!res?.ok });
  }
  return NextResponse.json({ ok: false, error: "Nothing to do" }, { status: 400 });
}
