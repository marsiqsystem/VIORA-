// Wix -> WhatsApp automation (Workflow 1, order placed). STATELESS.
//
// Ported from whatsapp-crm/routes/wixWebhook.js. Point your Wix Automation
// ("Send via webhook") at:  https://<site>/api/wix-webhook
//
// Flow: parse order -> create Velocity shipment (AWB) -> push tracking back to
// Wix -> send WF1 order_confirmation_v1 (idempotent via a Wix order flag).
// We AWAIT the work before acking (Vercel has no reliable after-response work).

import { NextRequest, NextResponse } from "next/server";
import { extractOrderInfo } from "@/lib/crm/wixOrder";
import * as velocity from "@/lib/crm/velocity";
import * as wix from "@/lib/crm/wix";
import * as notify from "@/lib/crm/notify";
import T from "@/lib/crm/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WF1_FLAG = "wa_wf1_sent";

export async function POST(req: NextRequest) {
  const expected = process.env.WIX_WEBHOOK_SECRET;
  if (expected && req.headers.get("x-wix-secret") !== expected) {
    console.warn("[wix-webhook] rejected: bad or missing x-wix-secret");
    return new NextResponse(null, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }

  try {
    await processOrder(body);
  } catch (err) {
    console.error("[wix-webhook] processing error:", err);
  }
  return new NextResponse(null, { status: 200 });
}

async function processOrder(body: any) {
  const info = extractOrderInfo(body, process.env.DEFAULT_COUNTRY_CODE || "91");
  console.log(
    `[wix-webhook] order=${info.orderId} phone=${info.phone || "(none)"} ` +
      `name=${info.customerName} amount=${info.amount || "-"} pay=${info.paymentMode} ` +
      `product="${info.product || "-"}"`
  );

  if (!info.amount || !info.product || process.env.WIX_WEBHOOK_LOG_RAW === "true") {
    console.warn(
      "[wix-webhook] missing amount/product — RAW payload for mapping:\n" +
        JSON.stringify(body, null, 2)
    );
  }

  if (!info.orderId) {
    console.warn("[wix-webhook] no order id — skipping.");
    return;
  }

  const order: any = {
    orderId: info.orderId,
    orderGuid: info.orderGuid,
    phone: info.phone,
    name: info.customerName,
    email: info.email,
    product: info.product,
    productId: info.productId,
    productImage: info.productImage,
    sku: info.sku,
    items: info.items,
    amount: info.amount,
    paymentMode: info.paymentMode,
    address: info.address,
  };

  wix.ensureMockOrder(order);

  // The GUID is what every Wix API call keys on (fulfillment write, order fetch,
  // flag write); the human number is only for display. Fall back to the number.
  const wixKey = info.orderGuid || info.orderId;

  // 3) Velocity shipment.
  const ship: any = await velocity.createShipment(order);
  if (ship.ok && ship.awb) {
    // 4) Write tracking back into Wix — the storefront reads it from there.
    await wix.pushTracking(wixKey, { awb: ship.awb, trackingUrl: ship.trackingUrl });
    order.awb = ship.awb;
    order.trackingUrl = ship.trackingUrl;
    console.log(`[wix-webhook] tracking pushed to Wix: awb=${ship.awb}`);
  } else if (!ship.ok) {
    console.error("[wix-webhook] Velocity shipment failed:", ship.error);
  }

  if (!info.phone) {
    console.warn("[wix-webhook] no usable phone — WhatsApp skipped.");
    return;
  }

  // 5) WF1 with Wix-flag idempotency.
  const current = (await wix.getOrder(wixKey)) || order;
  if (wix.getFlag(current, WF1_FLAG)) {
    console.log(`[wix-webhook] ${WF1_FLAG} already set for ${info.orderId} — skip WF1.`);
    return;
  }

  const result: any = await notify.sendOrderConfirmation(order);
  if (result.ok && !result.dryRun) {
    await wix.setFlag(wixKey, WF1_FLAG);
    console.log(`[wix-webhook] WF1 ${T.orderConfirmation.name} sent.`);
  } else if (result.dryRun) {
    console.log("[wix-webhook] WF1 DRY RUN (flag not set).");
  } else {
    console.error("[wix-webhook] WF1 FAILED:", result.error || result.data);
  }
}
