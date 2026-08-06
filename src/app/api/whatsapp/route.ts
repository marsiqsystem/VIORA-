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
import crypto from "crypto";
import { handleInbound } from "@/lib/crm/autoReply";
import { ingestWebhook } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Verify Meta's X-Hub-Signature-256 (HMAC-SHA256 of the raw body with the app
// secret) so nobody can POST forged inbound messages/statuses to this public URL.
//
// ADAPTED (non-breaking): enforcement is ON only when WHATSAPP_APP_SECRET is set.
// If it's unset we WARN and allow, so adding this can't silently break the live
// webhook on a deploy where the secret isn't configured yet. Set the secret in
// Vercel (Meta App → Settings → Basic → App Secret) to turn on rejection.
//   returns true  -> valid, proceed
//   returns false -> secret set but signature missing/bad -> reject 401
//   returns "skip" -> secret not set -> allow (logged)
function verifySignature(req: NextRequest, raw: string): boolean | "skip" {
  const secret = (process.env.WHATSAPP_APP_SECRET || "").trim();
  if (!secret) {
    console.warn(
      "[whatsapp] WHATSAPP_APP_SECRET not set — skipping signature check. Set it to reject forged webhooks."
    );
    return "skip";
  }
  const header = req.headers.get("x-hub-signature-256") || "";
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  try {
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

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
  // Read the RAW body first — the signature is computed over these exact bytes.
  const raw = await req.text();
  if (verifySignature(req, raw) === false) {
    console.warn("[whatsapp] rejected POST: bad X-Hub-Signature-256.");
    return new NextResponse(null, { status: 401 });
  }

  let body: any = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    /* empty / non-JSON body — treat as no-op */
  }
  try {
    await handleInbound(body);
  } catch (err) {
    console.error("Inbound handling error:", err);
  }
  // Persist the same body into the two-way inbox store (customer replies +
  // delivery/read ticks). Purely additive to the auto-reply pipeline above and
  // failure-isolated — a store hiccup must never break the webhook ack.
  try {
    await ingestWebhook(body);
  } catch (err) {
    console.error("Inbox ingest error:", err);
  }
  // Always 200 so Meta doesn't disable the webhook or retry-storm.
  return new NextResponse(null, { status: 200 });
}
