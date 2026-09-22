// TEMP admin route — send the `order_confirm_reply_yes_v1` WhatsApp template to
// customers who did NOT pick up the confirmation call. For each Wix order it fills
// the template's 6 variables and uses the product photo as the IMAGE header:
//   {{1}} name  {{2}} order#  {{3}} item  {{4}} amount  {{5}} payment  {{6}} delivery-to
//
//   POST /api/admin/send-confirm-reply    (x-inbox-key: INBOX_SECRET, or {key})
//
// Body:
//   { "numbers":["10407", ...] }                 -> DRY RUN (default): resolves each
//        order's name/phone/params and reports EXACTLY what would send. Sends nothing.
//   { "numbers":[...], "send": true }             -> actually send.
//   { "merges":[{ "keyNumber":"10424", "numbers":["10424","10425"],
//        "item":"A + B", "amount":1146, "deliveryTo":"Hyderabad, Telangana 500075" }] }
//        -> ONE combined message for a customer who placed two orders (numbers in a
//        merge are skipped in the individual list).
//   { "deliveryOverrides":{ "10424":"Hyderabad, Telangana 500075" } }  -> optional
//        per-order {{6}} override when the Wix address is wrong/incomplete.
//
// DELETE this route once the batch has been sent.

import { NextRequest, NextResponse } from "next/server";
import * as wix from "@/lib/crm/wix";
import { sendTemplate } from "@/lib/crm/whatsapp";
import T from "@/lib/crm/templates";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TEMPLATE = "order_confirm_reply_yes_v1";
const LANG = "en"; // this template is approved in "en" (not en_US)
const FALLBACK_IMAGE = (T as any)?.orderConfirmation?.headerImageUrl; // Viora logo

/** Fetch the FULL Wix order (search, then re-fetch by GUID for address/items). */
async function fullOrder(number: string) {
  const found: any = await wix.findOrderByNumber(number);
  if (!found) return null;
  let order: any = found;
  const guid = found.orderGuid || found.orderId;
  if (guid) {
    try {
      const full = await wix.getOrder(guid);
      if (full) order = { ...found, ...full };
    } catch {
      /* keep the search result */
    }
  }
  return order;
}

const prettyPay = (m: any) => (String(m).toUpperCase() === "PREPAID" ? "Prepaid" : "COD");
const cleanAmt = (a: any) => String(Math.round(Number(String(a ?? "").replace(/[^\d.]/g, "")) || 0));
const deliveryOf = (addr: any) => {
  const a = addr || {};
  return [a.city, a.state, a.postalCode].filter(Boolean).join(", ");
};

async function sendOne(opts: {
  label: any;
  name: any;
  phone: any;
  orderId: string;
  item: any;
  amount: any;
  paymentMode: any;
  deliveryTo: any;
  image: any;
  doSend: boolean;
}) {
  const bodyParams = [
    opts.name || "there",
    opts.orderId,
    opts.item || "your order",
    cleanAmt(opts.amount),
    prettyPay(opts.paymentMode),
    opts.deliveryTo || "",
  ];
  const base = { ...opts.label, name: opts.name, phone: opts.phone, bodyParams, hasImage: !!opts.image };
  if (!opts.doSend) return { ...base, wouldSend: true };
  if (!opts.phone) return { ...base, ok: false, reason: "no phone on order" };
  const res: any = await sendTemplate({
    to: opts.phone,
    templateName: TEMPLATE,
    languageCode: LANG,
    headerImageUrl: opts.image || FALLBACK_IMAGE,
    bodyParams,
  });
  return {
    ...base,
    ok: !!res.ok,
    dryRun: !!res.dryRun,
    id: res?.data?.messages?.[0]?.id || null,
    error: res.ok ? undefined : String(res.error?.message || res.error || "send failed"),
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
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  if (!authOk(body?.key ?? keyFromRequest(req)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const doSend = body?.send === true;
  const numbers: string[] = Array.isArray(body?.numbers)
    ? body.numbers.map((n: any) => String(n).trim()).filter(Boolean)
    : [];
  const merges: any[] = Array.isArray(body?.merges) ? body.merges : [];
  const deliveryOverrides: Record<string, string> =
    body?.deliveryOverrides && typeof body.deliveryOverrides === "object" ? body.deliveryOverrides : {};

  if (!numbers.length && !merges.length)
    return NextResponse.json({ ok: false, error: "numbers[] or merges[] required." }, { status: 400 });

  // Order numbers covered by a merge are NOT also sent individually.
  const mergedNums = new Set<string>();
  for (const m of merges) for (const n of m?.numbers || []) mergedNums.add(String(n).trim());

  const results: any[] = [];

  // 1) Combined (merge) messages — one send per group.
  for (const m of merges) {
    const keyNumber = String(m?.keyNumber || (m?.numbers || [])[0] || "").trim();
    const order = await fullOrder(keyNumber);
    if (!order) {
      results.push({ group: m?.numbers, keyNumber, ok: false, reason: "key order not found in Wix" });
      continue;
    }
    results.push(
      await sendOne({
        label: { group: m?.numbers, keyNumber },
        name: order.name,
        phone: order.phone,
        orderId: keyNumber,
        item: m?.item || order.product,
        amount: m?.amount != null ? m.amount : order.amount,
        paymentMode: order.paymentMode,
        deliveryTo: m?.deliveryTo || deliveryOverrides[keyNumber] || deliveryOf(order.address),
        image: order.productImage,
        doSend,
      })
    );
  }

  // 2) Individual messages.
  for (const number of numbers) {
    if (mergedNums.has(number)) continue;
    const order = await fullOrder(number);
    if (!order) {
      results.push({ number, ok: false, reason: "order not found in Wix" });
      continue;
    }
    results.push(
      await sendOne({
        label: { number },
        name: order.name,
        phone: order.phone,
        orderId: number,
        item: order.product,
        amount: order.amount,
        paymentMode: order.paymentMode,
        deliveryTo: deliveryOverrides[number] || deliveryOf(order.address),
        image: order.productImage,
        doSend,
      })
    );
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => r.ok === false).length;
  return NextResponse.json({
    ok: true,
    mode: doSend ? "send" : "dry-run",
    template: TEMPLATE,
    total: results.length,
    ...(doSend ? { sent, failed } : {}),
    results,
  });
}
