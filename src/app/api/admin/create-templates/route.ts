// TEMPORARY admin route — creates the two manual WhatsApp templates (NDR
// re-attempt for COD, and "reply YES" order confirmation) via the Meta Graph
// API, then is deleted. Guarded by INBOX_SECRET. Call once, then remove.
//
//   GET /api/admin/create-templates?key=INBOX_SECRET
//   -> { ok, handle, results: [{ name, status, id?, error? }] }
//
// Both templates use an IMAGE header (product photo at send time), so we first
// upload a sample image to get a header_handle, then create each template.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GRAPH = "https://graph.facebook.com";
const VERSION = process.env.GRAPH_API_VERSION || "v22.0";
const WABA_ID = (process.env.WHATSAPP_BUSINESS_ID || process.env.WABA_ID || "").trim();
const APP_ID = (process.env.FB_APP_ID || "1857211185254407").trim(); // Viora Communications app
const SAMPLE_IMG = process.env.WHATSAPP_HEADER_IMAGE_URL || "https://viorajewel.in/email-logo.png";

// Upload a sample image via the resumable upload API and return its handle
// (required as the IMAGE-header example when creating a media-header template).
async function uploadSampleHandle(token: string): Promise<string> {
  const img = await fetch(SAMPLE_IMG);
  const buf = Buffer.from(await img.arrayBuffer());
  const type = img.headers.get("content-type") || "image/png";

  const startUrl =
    `${GRAPH}/${VERSION}/${APP_ID}/uploads` +
    `?file_name=sample.png&file_length=${buf.length}&file_type=${encodeURIComponent(type)}`;
  const startRes = await fetch(startUrl, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}` },
  });
  const startData = await startRes.json();
  if (!startRes.ok || !startData?.id) {
    throw new Error(`upload-start failed: ${JSON.stringify(startData)}`);
  }

  const finishRes = await fetch(`${GRAPH}/${VERSION}/${startData.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, file_offset: "0" },
    body: buf,
  });
  const finishData = await finishRes.json();
  if (!finishRes.ok || !finishData?.h) {
    throw new Error(`upload-finish failed: ${JSON.stringify(finishData)}`);
  }
  return finishData.h as string;
}

function templates(handle: string) {
  const header = { type: "HEADER", format: "IMAGE", example: { header_handle: [handle] } };

  const ndrBody =
    "Hi {{1}}, this is Viora Jewels 💛\n\n" +
    "Good news — your order #{{2}} ({{3}}) has reached your city! Our delivery partner tried to call you for delivery but couldn't reach you.\n\n" +
    "📦 A re-attempt will be made today or tomorrow, so please keep your phone reachable.\n\n" +
    "💰 This is a Cash on Delivery order of ₹{{4}} — kindly keep the amount ready for the delivery executive.\n\n" +
    "🔒 Important: As this is a COD order, no OTP is required. Please do not share any OTP with the delivery executive.\n\n" +
    "Tap Track Order below to follow your delivery live. ✨";

  const confirmBody =
    "Hi {{1}}, this is Viora Jewels 💛\n\n" +
    "We tried reaching you over a call to confirm your order but couldn't connect. Here are your order details:\n\n" +
    "🧾 Order: #{{2}}\n" +
    "💎 Item: {{3}}\n" +
    "💰 Amount: ₹{{4}} ({{5}})\n" +
    "📍 Delivery to: {{6}}\n\n" +
    "To confirm your order, simply reply YES to this message and we'll pack and ship it right away! ✨\n\n" +
    "If anything needs a change, just reply here and our team will help you.";

  return [
    {
      name: "delivery_reattempt_cod_v1",
      language: "en",
      category: "UTILITY",
      components: [
        header,
        {
          type: "BODY",
          text: ndrBody,
          example: { body_text: [["Priya", "10245", "Rakhi Luxe Gift Set", "1299"]] },
        },
        {
          type: "BUTTONS",
          buttons: [{ type: "URL", text: "Track Order", url: "https://viorajewel.in/orders" }],
        },
      ],
    },
    {
      name: "order_confirm_reply_yes_v1",
      language: "en",
      category: "UTILITY",
      components: [
        header,
        {
          type: "BODY",
          text: confirmBody,
          example: {
            body_text: [
              [
                "Priya",
                "10245",
                "Rakhi Luxe Gift Set",
                "1299",
                "Cash on Delivery",
                "221B, MG Road, Jaipur, Rajasthan 302001",
              ],
            ],
          },
        },
      ],
    },
  ];
}

export async function GET(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  }
  if (!authOk(keyFromRequest(req) ?? req.nextUrl.searchParams.get("key"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !WABA_ID) {
    return NextResponse.json(
      { ok: false, error: "WHATSAPP_ACCESS_TOKEN / WHATSAPP_BUSINESS_ID missing." },
      { status: 503 }
    );
  }

  let handle: string;
  try {
    handle = await uploadSampleHandle(token);
  } catch (e: any) {
    return NextResponse.json({ ok: false, step: "upload", error: String(e?.message || e) }, { status: 502 });
  }

  const results: any[] = [];
  for (const tpl of templates(handle)) {
    try {
      const res = await fetch(`${GRAPH}/${VERSION}/${WABA_ID}/message_templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(tpl),
      });
      const data = await res.json();
      results.push({
        name: tpl.name,
        ok: res.ok,
        status: data?.status,
        id: data?.id,
        error: data?.error,
      });
    } catch (e: any) {
      results.push({ name: tpl.name, ok: false, error: String(e?.message || e) });
    }
  }

  return NextResponse.json({ ok: true, handle: handle.slice(0, 16) + "…", results });
}
