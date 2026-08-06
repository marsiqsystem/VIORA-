// Inbox MEDIA proxy — streams a WhatsApp media id's bytes so a customer's photo
// (or sticker/doc) renders inline in the thread WITHOUT persisting it anywhere.
//
//   GET /api/inbox/media?id=<mediaId>&key=<INBOX_SECRET>
//
// Meta media URLs are short-lived and require the access token, so an <img> tag
// can't hit them directly — it points here instead, and we fetch + relay the
// bytes on demand. Auth is via the `?key=` query param (an <img> can't send a
// custom header). Protected by INBOX_SECRET (fail-closed) like the rest of the
// inbox: these are private customer media.

import { NextRequest, NextResponse } from "next/server";
import { fetchMediaBytes } from "@/lib/crm/whatsapp";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  }
  if (!authOk(keyFromRequest(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing media id." }, { status: 400 });
  }
  // Defense-in-depth: a Meta media id is a long digit/opaque token. Reject
  // anything with other characters before interpolating it into the Graph URL,
  // so a crafted id can't reshape the request path (the route is behind the
  // inbox passcode anyway, but validate regardless).
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid media id." }, { status: 400 });
  }

  const media = await fetchMediaBytes(id);
  if (!media.ok || !media.buffer) {
    return NextResponse.json(
      { ok: false, error: "Media unavailable (it may have expired)." },
      { status: 404 }
    );
  }

  return new NextResponse(media.buffer as any, {
    status: 200,
    headers: {
      "Content-Type": media.mime || "application/octet-stream",
      // Private customer media: cache only in the operator's browser, briefly.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
