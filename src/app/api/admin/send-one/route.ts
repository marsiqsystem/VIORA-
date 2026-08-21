// TEMP admin route — send the Rakhi template to ONE arbitrary number (a sample
// so we can see exactly what recipients receive). Not tied to the broadcast list.
//
//   GET /api/admin/send-one?key=<INBOX_SECRET>&to=918100460566&mediaId=<id>[&name=Mars]
//
// -> { ok, to, wamid } | { ok:false, error }
// Delete this file after the sample check.

import { NextRequest, NextResponse } from "next/server";
import { sendTemplate } from "@/lib/crm/whatsapp";
import { recordOutbound, authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPLATE = "rakhi_luxe_gift_v1";
const LANG = "en_US";

export async function GET(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const to = (sp.get("to") || "").replace(/[^\d]/g, "");
  const mediaId = (sp.get("mediaId") || "").trim();
  const name = (sp.get("name") || "there").trim();
  if (!to) return NextResponse.json({ ok: false, error: "to required (e.g. 918100460566)" }, { status: 400 });
  if (!mediaId) return NextResponse.json({ ok: false, error: "mediaId required" }, { status: 400 });

  const res: any = await sendTemplate({
    to,
    templateName: TEMPLATE,
    languageCode: LANG,
    headerMediaId: mediaId,
    bodyParams: [name],
  });

  if (!res?.ok) {
    return NextResponse.json({ ok: false, error: res?.error || res?.data?.error || "send failed", raw: res }, { status: 502 });
  }
  const wamid = res?.data?.messages?.[0]?.id;
  try {
    await recordOutbound({ to, text: `📢 ${TEMPLATE} (sample)`, wamid, name, status: "sent", template: true });
  } catch { /* mirror best-effort */ }
  return NextResponse.json({ ok: true, to, wamid });
}
