// Email BROADCAST send API — sends ONE branded email to a batch of contacts.
//
//   POST /api/broadcast-email
//     { key, subject, message, footer?, buttonLabel?, buttonUrl?,
//       image?: { dataUrl }, contacts:[{ name, email }] }
//     -> { ok, sent, failed, results:[{ email, ok, error? }] }
//
// Mirrors the WhatsApp /api/broadcast flow: the client splits its CSV into small
// batches and posts them sequentially so each request stays under the serverless
// time limit and the UI can show live progress. Sends go out from our Titan
// mailbox (mail@viorajewel.in) via the shared mailer, throttled so we don't burst
// the SMTP connection. There is NO template approval — the admin writes the body.
//
// Protected by INBOX_SECRET (same passcode as the inbox / WhatsApp broadcast).

import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import { isValidEmail, normalizeEmail } from "@/lib/validateEmail";
import {
  renderBroadcastEmail,
  renderBroadcastText,
  personalize,
  LOGO_CID,
  HERO_CID,
  FB_CID,
  IG_CID,
} from "@/lib/crm/broadcastEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THROTTLE_MS = 150; // small gap between sends so SMTP isn't hammered
const MAX_BATCH = 25; // hard cap per request so we never risk the function timeout

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const publicPath = (name: string) => path.join(process.cwd(), "public", name);

// Decode a base64 data URL (data:image/png;base64,....) into a Buffer + filename.
function decodeDataUrl(dataUrl: string): { buffer: Buffer; filename: string } | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  const ext = (m[1].split("/")[1] || "png").replace(/[^a-z0-9]/gi, "") || "png";
  try {
    return { buffer: Buffer.from(m[2], "base64"), filename: `hero.${ext}` };
  } catch {
    return null;
  }
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
  if (!isMailConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Mail is not configured (MAIL_* / GMAIL_* missing)." },
      { status: 503 }
    );
  }

  const subject = String(body?.subject || "").trim();
  const message = String(body?.message || "").trim();
  const footer = String(body?.footer || "").trim();
  const buttonLabel = String(body?.buttonLabel || "").trim();
  const buttonUrl = String(body?.buttonUrl || "").trim();
  const contacts: any[] = Array.isArray(body?.contacts) ? body.contacts : [];

  if (!subject) {
    return NextResponse.json({ ok: false, error: "Subject is required." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ ok: false, error: "Message body is required." }, { status: 400 });
  }
  if (!contacts.length) {
    return NextResponse.json({ ok: false, error: "No contacts in this batch." }, { status: 400 });
  }
  if (contacts.length > MAX_BATCH) {
    return NextResponse.json(
      { ok: false, error: `Batch too large (max ${MAX_BATCH}).` },
      { status: 400 }
    );
  }

  // Decode the (optional) uploaded hero image once for the whole batch.
  const hero = body?.image?.dataUrl ? decodeDataUrl(body.image.dataUrl) : null;
  const hasImage = !!hero;

  // Brand chrome attachments are read from /public on disk (reliable regardless
  // of what's deployed); the hero comes from the uploaded bytes.
  const baseAttachments: any[] = [
    { filename: "logo.png", path: publicPath("email-logo.png"), cid: LOGO_CID, contentDisposition: "inline" },
    { filename: "facebook.png", path: publicPath("facebook.png"), cid: FB_CID, contentDisposition: "inline" },
    { filename: "instagram.png", path: publicPath("instagram.png"), cid: IG_CID, contentDisposition: "inline" },
  ];
  if (hero) {
    baseAttachments.push({
      filename: hero.filename,
      content: hero.buffer,
      cid: HERO_CID,
      contentDisposition: "inline",
    });
  }

  const results: { email: string; ok: boolean; error?: string }[] = [];
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i] || {};
    const email = normalizeEmail(c.email);
    const name = String(c.name || "").trim();

    if (!isValidEmail(email)) {
      failed++;
      results.push({ email: String(c.email || ""), ok: false, error: "invalid email" });
      continue;
    }

    const html = renderBroadcastEmail({
      message: personalize(message, name),
      footer: footer ? personalize(footer, name) : undefined,
      buttonLabel,
      buttonUrl,
      hasImage,
    });
    const text = renderBroadcastText(personalize(message, name), footer ? personalize(footer, name) : undefined);

    try {
      await sendMail({
        to: email,
        subject: personalize(subject, name),
        html,
        text,
        attachments: baseAttachments,
      });
      sent++;
      results.push({ email, ok: true });
    } catch (err: any) {
      failed++;
      results.push({ email, ok: false, error: err?.message || "send failed" });
    }

    if (i < contacts.length - 1) await sleep(THROTTLE_MS);
  }

  return NextResponse.json({ ok: true, sent, failed, results });
}
