// TEMP admin route — creates the "review_request_photo_v1" MARKETING template on
// the WABA and submits it to Meta for review. Hit it ONCE, then delete this file.
//
//   GET /api/admin/create-review-photo-template?key=<INBOX_SECRET>
//     &imageUrl=<optional sample header image>   (default: the review-instructions PNG)
//     &dryRun=1                                   (build the payload, don't call Meta)
//
// WHY: the current review template (review_request_util_v1) is header-less and
// has no reward. This MARKETING template drives the new WhatsApp-native review
// loop: the IMAGE header carries the "how to review" instructions, the body asks
// for a reply with stars + a photo and promises ₹75 OFF the next order, and the
// URL button (suffix = product slug) is the website path for non-logged-in users.
//
// Variables line up with notify.sendReviewRequest with NO param changes:
//   body {{1}} = customer name, {{2}} = order id ; button url {{1}} = product slug.
// At send time the header image is overridden with the order's product photo (the
// sample uploaded here is only for Meta's review). Language is "en" to match the
// LANG the send path uses (a mismatch is the #1 cause of 132001 "template does
// not exist"). An IMAGE-header template needs a sample header supplied as an
// uploaded media HANDLE (not a link) via Meta's Resumable Upload API; this route
// does the whole dance. Protected by INBOX_SECRET (fail-closed).

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/crm/whatsapp";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com";
// Meta app id that the WhatsApp system-user token belongs to (not a secret).
const APP_ID =
  (process.env.WHATSAPP_APP_ID || process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || "1857211185254407").trim();

// The "how to review" instruction card, served from public/ once this is deployed.
const DEFAULT_IMAGE = "https://www.viorajewel.in/review-instructions.png";

const TEMPLATE_NAME = "review_request_photo_v1";
const LANGUAGE = "en"; // MUST match templates.js LANG (see notify.sendReviewRequest)

// MARKETING body: {{1}} name, {{2}} order id (same order as review_request_util_v1,
// so the existing send path needs no param changes). Carries the reward + the
// WhatsApp-native review instructions; the website button handles non-logged-in.
const BODY_TEXT =
  "Hi {{1}}, we hope you're loving your Viora jewellery from order #{{2}}! ✨\n\n" +
  "*Leave a review and get FLAT ₹75 OFF your next order* 🎁\n\n" +
  "It's quick — just *reply to this message* with:\n" +
  "⭐ A rating out of 5\n" +
  "📸 A photo of your piece\n" +
  "✍️ A few words about it\n\n" +
  "Your ₹75 voucher then applies automatically on your next order. " +
  "Prefer our website? Tap the button below to review there instead.\n\n" +
  "Thank you for choosing Viora 💛";

// Meta rejects footers containing newlines OR emojis (error 2388073), so plain.
const FOOTER_TEXT = "Viora Jewels • reply with a photo review for ₹75 off";

const BUTTONS = [
  {
    type: "URL",
    text: "Leave a review",
    // {{1}} = product slug suffix (same as notify.sendReviewRequest already sends).
    url: "https://www.viorajewel.in/{{1}}",
    example: ["https://www.viorajewel.in/royal-heartfall-jewelry-set-blue"],
  },
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
    `?file_name=review-instructions.png&file_length=${bytes.length}&file_type=${encodeURIComponent(mime)}` +
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
    body: new Uint8Array(bytes),
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
      { type: "BODY", text: BODY_TEXT, example: { body_text: [["Priya", "10231"]] } },
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
