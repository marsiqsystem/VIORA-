// Shared courier status-webhook handler (Shiprocket). Both /api/courier-webhook
// (the neutral URL Shiprocket accepts — its config UI rejects URLs containing the
// words "shiprocket", "kartrocket", "sr", "kr") and the legacy /api/shiprocket-
// webhook alias delegate here, so there is exactly one implementation.
//
//   OUT_FOR_DELIVERY -> out_for_delivery_v1  (WF2)
//   DELIVERED        -> order_delivered_v1   (WF3)  [+ markDelivered on Wix]
//
// The customer (name/phone/product) is NOT in the webhook — we recover it from
// Wix by the order_id Shiprocket echoes back ("VJ-#<number>", stripped by
// wix.findOrderByNumber), or by AWB as a fallback. Verified with the token set in
// Shiprocket's webhook config (sent as the x-api-key header) vs SHIPROCKET_WEBHOOK_SECRET.

import { NextRequest, NextResponse } from "next/server";
import * as shiprocket from "@/lib/crm/shiprocket";
import * as wix from "@/lib/crm/wix";
import * as notify from "@/lib/crm/notify";
import * as idempotency from "@/lib/crm/idempotency";
import * as reviewQueue from "@/lib/crm/reviewQueue";
import { dispatchCancellationOnce } from "@/lib/crm/cancel";

export function courierWebhookInfo() {
  return NextResponse.json({
    ok: true,
    endpoint: "courier-webhook",
    method: "POST",
    message: "Shiprocket status webhook is live. Send status updates via POST.",
  });
}

// Send a template AT MOST ONCE per (order, flag). Atomic-KV dedupe — couriers
// fire multiple events per milestone.
async function dispatchOnce(order: any, flagKey: string, sendFn: (o: any) => Promise<any>) {
  const orderId = order.orderId || order.orderGuid;
  const key = `${flagKey}:${orderId}`;
  const claim = await idempotency.claimOnce(key);
  if (!claim.claimed) {
    console.log(`[courier-webhook] ${flagKey} already sent for ${orderId} — skip (idempotent).`);
    return;
  }
  const result = await sendFn(order);
  if (result.ok && !result.dryRun) {
    console.log(`[courier-webhook] ${flagKey} sent for ${orderId}.`);
    return;
  }
  await idempotency.release(key);
  if (!result.ok) {
    console.error(`[courier-webhook] ${flagKey} FAILED:`, result.error);
  } else {
    console.log(`[courier-webhook] ${flagKey} DRY RUN for ${orderId} (claim released).`);
  }
}

export async function handleCourierWebhook(req: NextRequest) {
  // OPEN ACCESS: Shiprocket requires the webhook endpoint to be "open access", and
  // its Save/Test validation probe may reach us WITHOUT the configured token. So we
  // ALWAYS answer 200 (never 401) — but only PROCESS a request whose x-api-key
  // matches SHIPROCKET_WEBHOOK_SECRET. An unauthenticated/probe request is simply
  // acknowledged and ignored (no WhatsApp/Wix side effects), so returning 200 here
  // costs nothing security-wise: the token still gates every real action below.
  if (!shiprocket.verifyWebhook(req.headers.get("x-api-key"))) {
    console.log("[courier-webhook] acked (no/invalid token) — not processed.");
    return new NextResponse(null, { status: 200 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }

  try {
    const { references, awb, status, rawStatus, trackingUrl } = shiprocket.parseStatusWebhook(body);
    console.log(
      `[courier-webhook] status=${rawStatus} -> ${status} refs=[${references.join(",") || "-"}] awb=${awb || "-"}`
    );
    if (status === "OTHER") return new NextResponse(null, { status: 200 });

    // Try each candidate reference (channel_order_id first, then the numeric
    // order_id) via number/GUID lookup, then fall back to the AWB.
    let order: any = null;
    for (const ref of references) {
      order = (await wix.findOrderByNumber(ref)) || (await wix.getOrder(ref));
      if (order) break;
    }
    if (!order && awb) order = await wix.findOrderByAwb(awb);
    if (!order) {
      console.warn(`[courier-webhook] no Wix order (refs=[${references.join(",")}], awb=${awb}) — cannot message.`);
      return new NextResponse(null, { status: 200 });
    }
    if (awb && !order.awb) order.awb = awb;
    // Tracking link for the dispatched WhatsApp ({{3}}). Prefer the URL in the
    // webhook; otherwise build Shiprocket's OWN public tracking page from the AWB.
    // We must NOT let notify.js fall back to its default TRACK_BASE — that's the
    // Velocity-branded host, which would produce a dead link for a Shiprocket AWB.
    if (trackingUrl && !order.trackingUrl) order.trackingUrl = trackingUrl;
    else if (!order.trackingUrl && awb) order.trackingUrl = `https://shiprocket.co/tracking/${awb}`;

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
    console.error("[courier-webhook] processing error:", err);
  }
  return new NextResponse(null, { status: 200 });
}
