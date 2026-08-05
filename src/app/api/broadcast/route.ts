// Broadcast send API — sends ONE approved template to a batch of contacts.
//
//   POST /api/broadcast   { key, id, total, template, contacts:[...] }
//     -> { ok, id, sent, failed, results:[{phone, ok, error?}] }
//   GET  /api/broadcast?key=...            -> { ok, broadcasts:[...] }   (history)
//
// The client splits its CSV into small batches and posts them sequentially with
// the same `id`, so each request stays well under the serverless time limit and
// the UI can show live progress. Sends are throttled (a short gap between calls)
// so Meta doesn't flag a burst. Every send is also mirrored into the inbox, so a
// broadcast shows up in each customer's thread like any other message.
//
// Template messages bypass the 24-hour window, so there is NO window check here
// (unlike /api/inbox/send). Protected by INBOX_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { sendTemplate } from "@/lib/crm/whatsapp";
import { recordOutbound, authOk, authConfigured, keyFromRequest, normPhone } from "@/lib/crm/inbox-store";
import { ensureBroadcast, bumpBroadcast, listBroadcasts } from "@/lib/crm/broadcast-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THROTTLE_MS = 120; // small gap between sends to avoid a burst
const MAX_BATCH = 60; // hard cap per request so we never risk the function timeout

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  }
  if (!authOk(keyFromRequest(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const broadcasts = await listBroadcasts(50);
  return NextResponse.json({ ok: true, broadcasts });
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

  const id = String(body?.id || "").trim();
  const template = body?.template || {};
  const templateName = String(template?.name || "").trim();
  const languageCode = String(template?.languageCode || "en_US").trim();
  const headerImageUrl = template?.headerImageUrl ? String(template.headerImageUrl) : undefined;
  const urlButtonIndex =
    template?.urlButtonIndex === 0 || template?.urlButtonIndex
      ? String(template.urlButtonIndex)
      : null;
  const contacts: any[] = Array.isArray(body?.contacts) ? body.contacts : [];

  if (!id || !templateName) {
    return NextResponse.json({ ok: false, error: "Missing `id` or `template.name`." }, { status: 400 });
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

  await ensureBroadcast({ id, templateName, lang: languageCode, total: Number(body?.total) || 0 });

  const results: { phone: string; ok: boolean; error?: string }[] = [];
  const failures: { phone: string; error: string }[] = [];
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i] || {};
    const phone = normPhone(c.phone);
    if (!phone) {
      failed++;
      results.push({ phone: String(c.phone || ""), ok: false, error: "invalid number" });
      failures.push({ phone: String(c.phone || ""), error: "invalid number" });
      continue;
    }

    const bodyParams = Array.isArray(c.bodyParams) ? c.bodyParams.map((v: any) => String(v ?? "")) : [];
    const buttonParam = c.buttonParam != null ? String(c.buttonParam) : "";
    const urlButtons =
      urlButtonIndex !== null && buttonParam
        ? [{ index: urlButtonIndex, param: buttonParam }]
        : [];

    const res: any = await sendTemplate({
      to: phone,
      templateName,
      languageCode,
      headerImageUrl,
      bodyParams,
      urlButtons,
    });

    if (res?.ok) {
      sent++;
      results.push({ phone, ok: true });
      // Mirror into the inbox so the broadcast appears in the customer's thread.
      // MUST await — a fire-and-forget write is killed when the serverless
      // response returns, which is why broadcasts weren't showing in the inbox.
      const wamid = res?.data?.messages?.[0]?.id;
      const text = String(c.text || `📢 ${templateName}`);
      const nm = String(c.name || "").trim();
      const imageUrl = c.headerImageUrl ? String(c.headerImageUrl) : headerImageUrl;
      try {
        await recordOutbound({
          to: phone,
          text,
          wamid,
          name: nm && nm.toLowerCase() !== "customer" ? nm : undefined,
          status: res?.dryRun ? "pending" : "sent",
          ...(imageUrl ? { type: "image", imageUrl } : {}),
        });
      } catch {
        /* inbox mirror is best-effort */
      }
    } else {
      failed++;
      const error =
        (typeof res?.error === "string" && res.error) ||
        res?.error?.message ||
        res?.data?.error?.message ||
        "send failed";
      results.push({ phone, ok: false, error });
      failures.push({ phone, error });
    }

    if (i < contacts.length - 1) await sleep(THROTTLE_MS);
  }

  await bumpBroadcast(id, { sent, failed, failures });

  return NextResponse.json({ ok: true, id, sent, failed, results });
}
