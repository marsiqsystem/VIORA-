// Shiprocket -> WhatsApp automation (Workflows 2 & 3). STATELESS.
//
// Mirrors /api/velocity-webhook so both couriers drive the same customer
// messages. Give Shiprocket this URL as their status webhook (Settings -> API ->
// Configure -> Webhooks):  https://www.viorajewel.in/api/shiprocket-webhook
// Set the webhook token there and copy it into SHIPROCKET_WEBHOOK_SECRET (sent
// back as the `x-api-key` header) to enable verification.
//
//   OUT_FOR_DELIVERY -> out_for_delivery_v1  (WF2)
//   DELIVERED        -> order_delivered_v1   (WF3)  [+ markDelivered on Wix]
//
// The customer (name/phone/product) is NOT in the webhook — we recover it from
// Wix by the order_id Shiprocket echoes back ("VJ-#<number>", stripped by
// wix.findOrderByNumber), or by AWB as a fallback.

import { NextRequest, NextResponse } from "next/server";
import * as shiprocket from "@/lib/crm/shiprocket";
import * as wix from "@/lib/crm/wix";
import * as notify from "@/lib/crm/notify";
import * as idempotency from "@/lib/crm/idempotency";
import * as reviewQueue from "@/lib/crm/reviewQueue";
import { dispatchCancellationOnce } from "@/lib/crm/cancel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "shiprocket-webhook",
    method: "POST",
    message: "Shiprocket status webhook is live. Send status updates via POST.",
  });
}

// Send a template AT MOST ONCE per (order, flag). Same atomic-KV dedupe as the
// Velocity webhook — couriers fire multiple events per milestone.
async function dispatchOnce(order: any, flagKey: string, sendFn: (o: any) => Promise<any>) {
  const orderId = order.orderId || order.orderGuid;
  const key = `${flagKey}:${orderId}`;
  const claim = await idempotency.claimOnce(key);
  if (!claim.claimed) {
    console.log(`[shiprocket-webhook] ${flagKey} already sent for ${orderId} — skip (idempotent).`);
    return;
  }
  const result = await sendFn(order);
  if (result.ok && !result.dryRun) {
    console.log(`[shiprocket-webhook] ${flagKey} sent for ${orderId}.`);
    return;
  }
  await idempotency.release(key);
  if (!result.ok) {
    console.error(`[shiprocket-webhook] ${flagKey} FAILED:`, result.error);
  } else {
    console.log(`[shiprocket-webhook] ${flagKey} DRY RUN for ${orderId} (claim released).`);
  }
}

export async function POST(req: NextRequest) {
  if (!shiprocket.verifyWebhook(req.headers.get("x-api-key"))) {
    console.warn("[shiprocket-webhook] rejected: failed secret check.");
    return new NextResponse(null, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }

  try {
    const { reference, awb, status, rawStatus, trackingUrl } = shiprocket.parseStatusWebhook(body);
    console.log(
      `[shiprocket-webhook] status=${rawStatus} -> ${status} ref=${reference || "-"} awb=${awb || "-"}`
    );
    if (status === "OTHER") return new NextResponse(null, { status: 200 });

    const order =
      (reference && (await wix.findOrderByNumber(reference))) ||
      (reference && (await wix.getOrder(reference))) ||
      (awb && (await wix.findOrderByAwb(awb))) ||
      null;
    if (!order) {
      console.warn(`[shiprocket-webhook] no Wix order (ref=${reference}, awb=${awb}) — cannot message.`);
      return new NextResponse(null, { status: 200 });
    }
    if (awb && !order.awb) order.awb = awb;
    if (trackingUrl && !order.trackingUrl) order.trackingUrl = trackingUrl;

    if (status === "DISPATCHED") {
      await dispatchOnce(order, "wa_dispatched_sent", notify.sendDispatched);
    } else if (status === "OUT_FOR_DELIVERY") {
      await dispatchOnce(order, "wa_wf2_sent", notify.sendOutForDelivery);
    } else if (status === "DELIVERED") {
      await wix.markDelivered(order.orderGuid || order.orderId, Date.now());
      await dispatchOnce(order, "wa_wf3_sent", notify.sendDelivered);
      await reviewQueue.enqueueDelivered(order, Date.now());
    } else if (status === "RTO") {
      await reviewQueue.dequeue(order.orderId);
    } else if (status === "CANCELLED") {
      await dispatchCancellationOnce(order);
    }
  } catch (err) {
    console.error("[shiprocket-webhook] processing error:", err);
  }
  return new NextResponse(null, { status: 200 });
}
