// Inbox SEND-TEMPLATE — send ONE approved template to the person in this chat.
//
//   POST /api/inbox/send-template
//     { to, templateName, languageCode, bodyParams?, headerImageUrl? }  (+ key)
//     -> { ok, id, dryRun }
//
// Templates bypass the 24-hour window, so — unlike /api/inbox/send — there is NO
// window check here. This is what powers the composer's "Send template" button
// (message a customer whose free-reply window has closed). The thread records the
// REAL approved body text (via renderTemplateBody), matching what the customer
// receives. Protected by INBOX_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { sendTemplate } from "@/lib/crm/whatsapp";
import { renderTemplateBody } from "@/lib/crm/templateText";
import { recordOutbound, getMessages, authOk, authConfigured, keyFromRequest, normPhone } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const to = normPhone(body?.to);
  const templateName = String(body?.templateName || "").trim();
  const languageCode = String(body?.languageCode || "en_US").trim();
  const headerImageUrl = body?.headerImageUrl ? String(body.headerImageUrl) : undefined;
  const bodyParams = Array.isArray(body?.bodyParams) ? body.bodyParams.map((v: any) => String(v ?? "")) : [];

  if (!to || !templateName) {
    return NextResponse.json({ ok: false, error: "Missing `to` or `templateName`." }, { status: 400 });
  }

  const sent: any = await sendTemplate({ to, templateName, languageCode, headerImageUrl, bodyParams });
  const wamid = sent?.data?.messages?.[0]?.id;

  // Keep the existing name on the conversation (don't overwrite with a template),
  // and store the real approved body text so the bubble matches the send.
  const thread = await getMessages(to);
  const text =
    (await renderTemplateBody(templateName, languageCode, bodyParams)) || `📢 ${templateName}`;

  const rec = await recordOutbound({
    to,
    text,
    wamid,
    status: sent?.dryRun ? "pending" : "sent",
    name: thread?.name || undefined,
    template: true,
    ...(headerImageUrl ? { type: "image", imageUrl: headerImageUrl } : {}),
  });

  if (!sent?.ok) {
    return NextResponse.json(
      { ok: false, error: sent?.error || sent?.data?.error?.message || "Template send failed." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, id: wamid || rec?.id, dryRun: !!sent?.dryRun });
}
