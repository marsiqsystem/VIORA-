// Meta WhatsApp Cloud API webhook — GET verification handshake + POST inbound.
//
// Ported from the standalone Express server (whatsapp-crm/server.js) into a
// Next.js route handler so it runs on Vercel with the rest of the site — no
// separate Render service. Meta callback URL becomes:  https://<site>/api/whatsapp
//
// On Vercel there is no "respond then keep working" guarantee, so we AWAIT the
// (light, AI-off) inbound processing before returning 200. That keeps Meta happy
// and the work reliable.

import { NextRequest, NextResponse } from "next/server";
import { handleInbound } from "@/lib/crm/autoReply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/whatsapp — Meta's verification handshake. Echo hub.challenge back
// verbatim (text/plain) when the mode + verify token match.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge") ?? "";

  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log("Webhook verified.");
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }
  console.warn("Webhook verification failed (bad mode or token).");
  return new NextResponse("Forbidden", { status: 403 });
}

// POST /api/whatsapp — incoming messages/statuses. Process then ack.
export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty / non-JSON body — treat as no-op */
  }
  try {
    await handleInbound(body);
  } catch (err) {
    console.error("Inbound handling error:", err);
  }
  // Always 200 so Meta doesn't disable the webhook or retry-storm.
  return new NextResponse(null, { status: 200 });
}
