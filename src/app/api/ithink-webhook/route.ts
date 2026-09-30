// iThink Logistics -> WhatsApp + storefront tracking automation. STATELESS.
//
// Give iThink this URL in their panel under "Push Order Statuses" / status webhook:
//   https://<site>/api/ithink-webhook
//
//   DISPATCHED       -> order_dispatched_v1   (WF1)  [+ store status "dispatched"]
//   OUT_FOR_DELIVERY -> out_for_delivery_v1   (WF2)  [+ store status "out_for_delivery"]
//   DELIVERED        -> order_delivered_v1    (WF3)  [+ markDelivered on Wix, review queue]
//   UNDELIVERED      -> delivery_reattempt_cod_v1 (COD only, once per attempt)
//   RTO / CANCELLED  -> cancellation message (deduped, shared KV key)
//
// Mirrors velocity-webhook / courierWebhook (Shiprocket) so all three couriers
// behave identically. The customer (name/phone/product) is NOT in the webhook — we
// recover it from Wix by the order reference iThink echoes back ("VJ-#<number>",
// stripped by wix.findOrderByNumber), or by AWB as a fallback.
//
// iThink's webhook field names vary, so ithink.parseStatusWebhook reads defensively
// from the common candidates. verifyWebhook checks the x-api-key header against
// ITHINK_WEBHOOK_SECRET when that env is set (until then it accepts, so iThink's
// "save/test" probe never fails). Every real side effect is still gated below.

import { NextRequest, NextResponse } from "next/server";
import * as ithink from "@/lib/crm/ithink";
import * as wix from "@/lib/crm/wix";
import * as notify from "@/lib/crm/notify";
import * as ordersStore from "@/lib/crm/orders-store";
import * as idempotency from "@/lib/crm/idempotency";
import * as reviewQueue from "@/lib/crm/reviewQueue";
import { dispatchCancellationOnce } from "@/lib/crm/cancel";
import { dispatchReattemptOnce } from "@/lib/crm/reattempt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Health check — opening the URL in a browser is a GET; the webhook only handles
// POST. Confirms the endpoint is deployed; iThink still POSTs the real updates.
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "ithink-webhook",
    method: "POST",
    message: "iThink status webhook is live. Send status updates via POST.",
  });
}

// Send a template AT MOST ONCE per (order, flag). Atomic-KV dedupe — couriers fire
// multiple events per milestone. Claim-before-send; release on dry-run/failure so a
// real retry can still deliver. FAIL-OPEN: a KV outage lets the message through.
async function dispatchOnce(order: any, flagKey: string, sendFn: (o: any) => Promise<any>) {
  const orderId = order.orderId || order.orderGuid;
  const key = `${flagKey}:${orderId}`;
  const claim = await idempotency.claimOnce(key);
  if (!claim.claimed) {
    console.log(`[ithink-webhook] ${flagKey} already sent for ${orderId} — skip (idempotent).`);
    return;
  }
  const result = await sendFn(order);
  if (result.ok && !result.dryRun) {
    console.log(`[ithink-webhook] ${flagKey} sent for ${orderId}.`);
    return;
  }
  await idempotency.release(key);
  if (!result.ok) {
    console.error(`[ithink-webhook] ${flagKey} FAILED:`, result.error);
  } else {
    console.log(`[ithink-webhook] ${flagKey} DRY RUN for ${orderId} (claim released).`);
  }
}

export async function POST(req: NextRequest) {
  // OPEN ACCESS: iThink's save/test probe may reach us without the token, so we
  // ALWAYS answer 200 but only PROCESS a request whose x-api-key matches
  // ITHINK_WEBHOOK_SECRET (verifyWebhook accepts everything until that env is set).
  if (!ithink.verifyWebhook(req.headers.get("x-api-key"))) {
    console.log("[ithink-webhook] acked (no/invalid token) — not processed.");
    return new NextResponse(null, { status: 200 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }

  try {
    const { references, awb, status, rawStatus, trackingUrl, attempt } = ithink.parseStatusWebhook(body);
    console.log(
      `[ithink-webhook] status=${rawStatus} -> ${status} refs=[${references.join(",") || "-"}] awb=${awb || "-"}`
    );
    if (status === "OTHER") return new NextResponse(null, { status: 200 });

    // Recover the customer from Wix. Try each candidate reference (our human order
    // number, echoed as "VJ-#<number>") via number/GUID lookup, then the AWB.
    let order: any = null;
    for (const ref of references) {
      order = (await wix.findOrderByNumber(ref)) || (await wix.getOrder(ref));
      if (order) break;
    }
    if (!order && awb) order = await wix.findOrderByAwb(awb);
    if (!order) {
      console.warn(`[ithink-webhook] no Wix order (refs=[${references.join(",")}], awb=${awb}) — cannot message.`);
      return new NextResponse(null, { status: 200 });
    }

    if (awb && !order.awb) order.awb = awb; // ensure the tracking link has a value
    // Tracking link for the dispatched WhatsApp ({{3}}). Prefer the webhook's URL;
    // otherwise build iThink's OWN public tracking page from the AWB. We must NOT let
    // notify.js fall back to its default (Velocity-branded) TRACK_BASE — that would
    // be a dead link for an iThink AWB. Mirrors the Shiprocket handler.
    if (trackingUrl && !order.trackingUrl) order.trackingUrl = trackingUrl;
    else if (!order.trackingUrl && awb) order.trackingUrl = `https://ithinklogistics.com/track/${awb}`;

    // Persist courier truth to the dashboard store so the storefront order-tracking
    // page (/orders/[id]) advances together with these WhatsApp updates instead of
    // staying stuck at "Confirmed". Best-effort — never blocks the customer message.
    // order.orderId is the human order number (the store key).
    await ordersStore.applyCourierStatus(order.orderId, status, {
      awb: order.awb,
      trackingUrl: order.trackingUrl,
      courier: "ithink",
    });

    if (status === "DISPATCHED") {
      await dispatchOnce(order, "wa_dispatched_sent", notify.sendDispatched);
    } else if (status === "OUT_FOR_DELIVERY") {
      await dispatchOnce(order, "wa_wf2_sent", notify.sendOutForDelivery);
    } else if (status === "DELIVERED") {
      await wix.markDelivered(order.orderGuid || order.orderId, Date.now());
      await dispatchOnce(order, "wa_wf3_sent", notify.sendDelivered);
      await reviewQueue.enqueueDelivered(order, Date.now());
    } else if (status === "UNDELIVERED") {
      // Failed delivery attempt (NDR) — COD re-attempt message, once per attempt.
      // Prepaid orders are skipped inside dispatchReattemptOnce.
      await dispatchReattemptOnce(order, attempt);
    } else if (status === "RTO") {
      await reviewQueue.dequeue(order.orderId);
      // Max attempts done — send the cancelled message. Shares the KV key with the
      // refusal cancellation so the customer is never messaged twice.
      await dispatchCancellationOnce(order);
    } else if (status === "CANCELLED") {
      await dispatchCancellationOnce(order);
    }
  } catch (err) {
    console.error("[ithink-webhook] processing error:", err);
  }
  return new NextResponse(null, { status: 200 });
}
