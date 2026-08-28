// TEMP admin route — send the approved `delivery_reattempt_cod_v1` UTILITY
// template to a list of Wix order numbers (NDR / failed-delivery COD orders), so
// the customer keeps the COD amount ready and the courier's re-attempt succeeds
// (cuts RTO). Mirrors the send-reviews backfill pattern.
//
//   POST /api/admin/send-reattempt        (x-inbox-key: INBOX_SECRET, or {key})
//
// Body:
//   { "numbers": ["10285","10282", ...] }        -> DRY RUN (default): resolves
//                                                    each order's phone/name/
//                                                    product/amount. Sends NOTHING.
//   { "numbers": [...], "send": true }            -> actually send to that set.
//   { "force": true }                             -> ignore the once-only claim
//                                                    (re-send even if already sent).
//   { "imageUrl": "https://…" }                   -> override the header image for
//                                                    every send (else per-order
//                                                    product photo, else logo).
//
// Template shape (verified via /api/templates): IMAGE header + 4 body vars —
//   {{1}} name, {{2}} order id, {{3}} product, {{4}} COD amount. Static Track
//   button carries no send-time parameter.
//
// Protected by INBOX_SECRET — fail closed. DELETE this route after the backfill.

import { NextRequest, NextResponse } from "next/server";
import * as wix from "@/lib/crm/wix";
import { sendTemplate } from "@/lib/crm/whatsapp";
import { applyOverride } from "@/lib/crm/orderOverride";
import { claimOnce, release } from "@/lib/crm/idempotency";
import {
  recordOutbound,
  authOk,
  authConfigured,
  keyFromRequest,
} from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TEMPLATE = process.env.TPL_DELIVERY_REATTEMPT || "delivery_reattempt_cod_v1";
const LANG =
  process.env.TPL_DELIVERY_REATTEMPT_LANG || process.env.TPL_LANG || "en";
const FALLBACK_IMG =
  process.env.WHATSAPP_HEADER_IMAGE_URL || "https://viorajewel.in/email-logo.png";

// Trim any trailing ".00" so the customer sees a clean "₹599", not "₹599.00".
const cleanAmount = (a: unknown) => {
  const n = Number(String(a ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return String(a ?? "");
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

async function sendOne(order: any, force: boolean, imageOverride: string) {
  const id = String(order.orderId ?? order.orderGuid ?? "");
  if (!id) return { sent: false, reason: "no id" };

  // Honour any per-order product override (colour/item changed after ordering).
  try {
    await applyOverride(order);
  } catch {
    /* best-effort — never block the send */
  }

  const key = `wa_reattempt:${id}`;
  if (!force) {
    const claim = await claimOnce(key);
    if (!claim.claimed)
      return { sent: false, name: order.name, reason: "already sent (claimed)" };
  }

  const amount = cleanAmount(order.amount);
  const bodyParams = [
    order.name || "there",
    order.orderId,
    order.product || "your order",
    amount,
  ];
  const headerImageUrl = imageOverride || order.productImage || FALLBACK_IMG;

  const res: any = await sendTemplate({
    to: order.phone,
    templateName: TEMPLATE,
    languageCode: LANG,
    headerImageUrl,
    bodyParams,
  });

  if (res?.ok && !res?.dryRun) {
    const wamid = res?.data?.messages?.[0]?.id;
    try {
      await recordOutbound({
        to: order.phone,
        text: `📦 ${TEMPLATE} (COD ₹${amount})`,
        wamid,
        name: order.name,
        status: "sent",
        template: true,
      });
    } catch {
      /* inbox mirror best-effort */
    }
    return { sent: true, name: order.name, phone: order.phone, amount, wamid };
  }

  if (!force) await release(key); // let a later retry try again
  return {
    sent: false,
    name: order.name,
    phone: order.phone,
    reason: res?.dryRun
      ? "dry-run (WHATSAPP_SEND_ENABLED off)"
      : res?.error || res?.data?.error?.message || "send failed",
  };
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  if (!authConfigured())
    return NextResponse.json(
      { ok: false, error: "INBOX_SECRET not configured." },
      { status: 503 }
    );
  if (!authOk(body?.key ?? keyFromRequest(req)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const force = body?.force === true;
  const doSend = body?.send === true;
  const imageOverride = String(body?.imageUrl ?? "").trim();
  const numbers: string[] = Array.isArray(body?.numbers)
    ? body.numbers.map((n: any) => String(n).trim()).filter(Boolean)
    : [];

  if (!numbers.length)
    return NextResponse.json(
      { ok: false, error: "numbers[] required (Wix order numbers)." },
      { status: 400 }
    );

  const results: any[] = [];
  for (const number of numbers) {
    const order = await wix.findOrderByNumber(number);
    if (!order) {
      results.push({ number, sent: false, reason: "no wix order" });
      continue;
    }
    if (!order.phone) {
      results.push({ number, name: order.name, sent: false, reason: "no phone" });
      continue;
    }
    if (!doSend) {
      results.push({
        number,
        name: order.name,
        phone: order.phone,
        product: order.product,
        amount: cleanAmount(order.amount),
        paymentMode: order.paymentMode,
        wouldSend: true,
      });
      continue;
    }
    results.push({ number, ...(await sendOne(order, force, imageOverride)) });
  }

  const sent = results.filter((r) => r.sent).length;
  return NextResponse.json({
    ok: true,
    dryRun: !doSend,
    template: TEMPLATE,
    sent,
    total: numbers.length,
    results,
  });
}
