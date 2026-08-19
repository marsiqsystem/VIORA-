// TEMP admin route — creates the "rakhi_luxe_gift_v1" MARKETING template on the
// WABA and submits it to Meta for review. Hit it ONCE, then delete this file.
//
//   GET /api/admin/create-rakhi-template?key=<INBOX_SECRET>
//     &imageUrl=<optional sample header image>   (default: the Viora email logo)
//     &dryRun=1                                   (build the payload, don't call Meta)
//
// An IMAGE-header template needs a sample header image supplied as an uploaded
// media HANDLE (not a link) via Meta's Resumable Upload API. This route does the
// whole dance: download the sample image -> create an upload session -> upload
// the bytes -> get the handle -> POST the template. The sample image is ONLY for
// Meta's review; at broadcast time the operator supplies the real photo, which
// overrides it. Protected by INBOX_SECRET (fail-closed) like the other admin
// routes.

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/crm/whatsapp";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com";
// Meta app id that the WhatsApp system-user token belongs to (not a secret).
const APP_ID =
  (process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || process.env.WHATSAPP_APP_ID || "1857211185254407").trim();

const DEFAULT_IMAGE = "https://viorajewel.in/email-logo.png";

const TEMPLATE_NAME = "rakhi_luxe_gift_v1";
const LANGUAGE = "en_US";

const BODY_TEXT =
  "Hi {{1}}, Raksha Bandhan is almost here — and this year, surprise your sister with something she'll truly treasure. 💛\n\n" +
  "Presenting the *Viora Rakhi Luxe Gift Set* — one exquisite box with a complete jewellery combo she'll fall in love with:\n\n" +
  "✨ A statement Necklace\n" +
  "✨ A matching pair of Earrings\n" +
  "✨ An elegant Ring\n" +
  "✨ A graceful Bracelet\n\n" +
  "Beautifully packed in a premium Rakhi gift box — a limited-time special she'll definitely adore. 🎁\n\n" +
  "⏰ *Order before 22nd* to get it delivered right on time for Rakhi.\n\n" +
  "💳 Pay *online / prepaid* for smoother, faster delivery — and get *FLAT ₹50 OFF*!\n\n" +
  "{{1}}, you've shopped with us before, and we'd love to make this Rakhi extra special for your family. 🌸";

const FOOTER_TEXT = "Viora • Limited-time Rakhi offer 🌸";

const BUTTONS = [
  { type: "URL", text: "Order Gift Set", url: "https://www.viorajewel.in/rakhi-luxe-gift-set" },
  { type: "URL", text: "Shop Rakhi Collection", url: "https://www.viorajewel.in/list?cat=rakhi-special" },
];

/** Upload a sample image to Meta's Resumable Upload API; return its handle `h`. */
async function uploadSampleHeader(imageUrl: string, token: string, version: string) {
  // 1) download the sample image bytes.
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) return { ok: false as const, error: `sample image fetch HTTP ${imgRes.status}` };
  const mime = imgRes.headers.get("content-type") || "image/png";
  const bytes = Buffer.from(await imgRes.arrayBuffer());
  if (!bytes.length) return { ok: false as const, error: "sample image is empty" };

  // 2) create an upload session on the app.
  const sessUrl =
    `${GRAPH}/${version}/${APP_ID}/uploads` +
    `?file_name=rakhi-sample.png&file_length=${bytes.length}&file_type=${encodeURIComponent(mime)}` +
    `&access_token=${encodeURIComponent(token)}`;
  const sessRes = await fetch(sessUrl, { method: "POST" });
  const sess = await sessRes.json().catch(() => ({}));
  if (!sessRes.ok || !sess?.id) {
    return { ok: false as const, error: sess?.error || `create upload session HTTP ${sessRes.status}`, step: "session" };
  }

  // 3) upload the bytes; Meta returns { h: "<handle>" }.
  const upRes = await fetch(`${GRAPH}/${version}/${sess.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, file_offset: "0" },
    body: bytes,
  });
  const up = await upRes.json().catch(() => ({}));
  if (!upRes.ok || !up?.h) {
    return { ok: false as const, error: up?.error || `upload bytes HTTP ${upRes.status}`, step: "upload" };
  }
  return { ok: true as const, handle: up.h as string, mime, size: bytes.length };
}

export async function GET(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  }
  if (!authOk(keyFromRequest(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { token, businessId, version } = config();
  if (!token || !businessId) {
    return NextResponse.json(
      { ok: false, error: "WHATSAPP_ACCESS_TOKEN / WHATSAPP_BUSINESS_ID not configured." },
      { status: 500 }
    );
  }

  const imageUrl = req.nextUrl.searchParams.get("imageUrl") || DEFAULT_IMAGE;
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  // Build the create payload (header_handle filled in after upload, unless dry run).
  const makePayload = (headerHandle: string | null) => ({
    name: TEMPLATE_NAME,
    language: LANGUAGE,
    category: "MARKETING",
    components: [
      {
        type: "HEADER",
        format: "IMAGE",
        example: { header_handle: [headerHandle || "<uploaded-at-submit-time>"] },
      },
      { type: "BODY", text: BODY_TEXT, example: { body_text: [["Priya"]] } },
      { type: "FOOTER", text: FOOTER_TEXT },
      { type: "BUTTONS", buttons: BUTTONS },
    ],
  });

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, appId: APP_ID, imageUrl, payload: makePayload(null) });
  }

  // 1) upload the sample header image -> handle.
  const uploaded = await uploadSampleHeader(imageUrl, token, version);
  if (!uploaded.ok) {
    return NextResponse.json(
      { ok: false, stage: "sample-upload", error: uploaded.error, step: (uploaded as any).step, appId: APP_ID },
      { status: 502 }
    );
  }

  // 2) create the template.
  const payload = makePayload(uploaded.handle);
  const res = await fetch(`${GRAPH}/${version}/${businessId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, stage: "create-template", status: res.status, error: data?.error || data, sentPayload: payload },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Submitted to Meta for review. Check WhatsApp Manager → Message templates.",
    template: { name: TEMPLATE_NAME, language: LANGUAGE, status: data?.status, id: data?.id, category: data?.category },
    sampleImage: { url: imageUrl, size: uploaded.size },
    raw: data,
  });
}
