// TEMP admin route — creates the "order_confirmation_v2" UTILITY template (image
// header, 8 body fields, 3 quick-reply buttons) on the WABA and submits it to Meta
// for review. Hit it ONCE, then delete this file.
//
//   GET /api/admin/create-confirm-template?key=<INBOX_SECRET>
//     &imageUrl=<optional sample header image>   (default: the Viora logo)
//     &dryRun=1                                   (build the payload, don't call Meta)
//
// The new all-in-one order-confirmation message: confirms the order, shows the
// address to verify, a smart-check line ({{8}}, filled only when the address needs
// a pincode/landmark fix), a "view your order" link, the no-OTP / exact-cash /
// 48-hour-exchange notes, and Confirm / Cancel / Change-address buttons. The live
// order_confirmation_v1 is untouched, so new customers keep getting messaged while
// this one is in review. Protected by INBOX_SECRET (fail-closed).

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/crm/whatsapp";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com";
const APP_ID =
  (process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || process.env.WHATSAPP_APP_ID || "1857211185254407").trim();
const DEFAULT_IMAGE = "https://viorajewel.in/email-logo.png";

const TEMPLATE_NAME = "order_confirmation_v2";
const LANGUAGE = "en";

const BODY_TEXT =
  "Hi {{1}} 🌸\n" +
  "Thank you for ordering with *VIORA JEWELS* 💎\n\n" +
  "🧾 *Order #{{2}}*\n" +
  "{{3}} · Qty: {{4}}\n" +
  "💰 ₹{{5}} — {{6}}\n\n" +
  "📍 *Deliver to:*\n" +
  "{{7}}\n" +
  "{{8}}\n" +
  "🔗 View your order: viorajewel.in/orders/{{2}}\n\n" +
  "Please *confirm* so we can dispatch today 👇\n\n" +
  "⚠️ *COD:* keep the exact cash ready. *No OTP is needed* for Cash on Delivery — if anyone asks you for an OTP, please *refuse*. It is never required to receive your parcel.\n" +
  "🔁 Easy *48-hour exchange* after delivery.\n" +
  "🚚 Tracking link follows once it ships.";

// Example values for Meta's review (all 8 fields must be non-empty).
const BODY_EXAMPLE = [[
  "Priya",
  "10925",
  "Rosa Blush Set (Pink)",
  "2",
  "1,136",
  "Cash on Delivery",
  "H-12 Rose Villa, MG Road, Jaipur, Rajasthan 302001",
  "Please confirm your pincode is 302001, and share a nearby landmark for a smooth delivery.",
]];

const BUTTONS = [
  { type: "QUICK_REPLY", text: "Confirm order" },
  { type: "QUICK_REPLY", text: "Cancel order" },
  { type: "QUICK_REPLY", text: "Change address" },
];

/** Upload a sample image to Meta's Resumable Upload API; return its handle `h`. */
async function uploadSampleHeader(imageUrl: string, token: string, version: string) {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) return { ok: false as const, error: `sample image fetch HTTP ${imgRes.status}` };
  const mime = imgRes.headers.get("content-type") || "image/png";
  const bytes = Buffer.from(await imgRes.arrayBuffer());
  if (!bytes.length) return { ok: false as const, error: "sample image is empty" };

  const sessUrl =
    `${GRAPH}/${version}/${APP_ID}/uploads` +
    `?file_name=confirm-sample.png&file_length=${bytes.length}&file_type=${encodeURIComponent(mime)}` +
    `&access_token=${encodeURIComponent(token)}`;
  const sessRes = await fetch(sessUrl, { method: "POST" });
  const sess = await sessRes.json().catch(() => ({}));
  if (!sessRes.ok || !sess?.id) {
    return { ok: false as const, error: sess?.error || `create upload session HTTP ${sessRes.status}`, step: "session" };
  }

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
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { token, businessId, version } = config();
  if (!token || !businessId) {
    return NextResponse.json({ ok: false, error: "WHATSAPP_ACCESS_TOKEN / WHATSAPP_BUSINESS_ID not configured." }, { status: 500 });
  }

  const imageUrl = req.nextUrl.searchParams.get("imageUrl") || DEFAULT_IMAGE;
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  const makePayload = (headerHandle: string | null) => ({
    name: TEMPLATE_NAME,
    language: LANGUAGE,
    category: "UTILITY",
    components: [
      { type: "HEADER", format: "IMAGE", example: { header_handle: [headerHandle || "<uploaded-at-submit-time>"] } },
      { type: "BODY", text: BODY_TEXT, example: { body_text: BODY_EXAMPLE } },
      { type: "BUTTONS", buttons: BUTTONS },
    ],
  });

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, appId: APP_ID, imageUrl, payload: makePayload(null) });
  }

  const uploaded = await uploadSampleHeader(imageUrl, token, version);
  if (!uploaded.ok) {
    return NextResponse.json({ ok: false, stage: "sample-upload", error: uploaded.error, step: (uploaded as any).step, appId: APP_ID }, { status: 502 });
  }

  const payload = makePayload(uploaded.handle);
  const res = await fetch(`${GRAPH}/${version}/${businessId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ ok: false, stage: "create-template", status: res.status, error: data?.error || data, sentPayload: payload }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    message: "Submitted to Meta for review. Check WhatsApp Manager → Message templates.",
    template: { name: TEMPLATE_NAME, language: LANGUAGE, status: data?.status, id: data?.id, category: data?.category },
    sampleImage: { url: imageUrl, size: uploaded.size },
    raw: data,
  });
}
