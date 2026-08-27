// Velocity -> WhatsApp automation (Workflows 2 & 3). STATELESS.
//
// Ported from whatsapp-crm/routes/velocityWebhook.js. Give Velocity this URL as
// their status webhook:  https://<site>/api/velocity-webhook
//
//   OUT_FOR_DELIVERY -> out_for_delivery_v1  (WF2)  [+ sets wa_wf2_sent on Wix]
//   DELIVERED        -> order_delivered_v1   (WF3)  [+ markDelivered on Wix]
//
// The customer (name/phone/product) is NOT in the webhook — we recover it from
// Wix by the order reference Velocity echoes back, or by AWB as a fallback.
//
// NOTE: velocity.parseStatusWebhook / normalizeStatus are wired to Velocity's
// tracking payload shape (order_external_id / tracking_number / shipment_status).
// The one open item is verifyWebhook — the shared-secret/HMAC check stays a
// scaffold until Velocity confirms the header they sign requests with.

import { NextRequest, NextResponse } from "next/server";
import * as velocity from "@/lib/crm/velocity";
import * as wix from "@/lib/crm/wix";
import * as notify from "@/lib/crm/notify";
import * as idempotency from "@/lib/crm/idempotency";
import * as reviewQueue from "@/lib/crm/reviewQueue";
import { dispatchCancellationOnce } from "@/lib/crm/cancel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Health check — opening the URL in a browser is a GET, and the webhook only
// handles POST (that's the 405 you'd otherwise see). This just confirms the
// endpoint is deployed and alive; Velocity still POSTs the real status updates.
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "velocity-webhook",
    method: "POST",
    message: "Velocity status webhook is live. Send status updates via POST.",
  });
}

// Send a template AT MOST ONCE per (order, flag). Dedupe on an atomic Vercel KV
// claim — NOT a Wix extendedFields flag: Wix rejects our API-key writes to the
// @viora/whatsapp namespace (INVALID_PATCH), so setFlag silently fails and never
// deduped. This matters because Velocity fires BOTH "Status Change" and
// "Tracking Addition" for the same milestone, so without an atomic claim every
// customer would get two dispatched (and two out-for-delivery/delivered)
// messages. Claim-before-send; release on dry-run/failure so a real retry can
// still deliver. FAIL-OPEN: a KV outage lets the message through (a rare dup
// beats a missed shipping update).
async function dispatchOnce(order: any, flagKey: string, sendFn: (o: any) => Promise<any>) {
  const orderId = order.orderId || order.orderGuid;
  const key = `${flagKey}:${orderId}`;
  const claim = await idempotency.claimOnce(key);
  if (!claim.claimed) {
    console.log(`[velocity-webhook] ${flagKey} already sent for ${orderId} — skip (idempotent).`);
    return;
  }
  const result = await sendFn(order);
  if (result.ok && !result.dryRun) {
    console.log(`[velocity-webhook] ${flagKey} sent for ${orderId}.`);
    return;
  }
  // Did not actually deliver — release the claim so a later event can retry.
  await idempotency.release(key);
  if (!result.ok) {
    console.error(`[velocity-webhook] ${flagKey} FAILED:`, result.error);
  } else {
    console.log(`[velocity-webhook] ${flagKey} DRY RUN for ${orderId} (claim released).`);
  }
}

export async function POST(req: NextRequest) {
  if (!velocity.verifyWebhook(req.headers.get("x-velocity-secret"))) {
    console.warn("[velocity-webhook] rejected: failed signature/secret check.");
    return new NextResponse(null, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }

  try {
    const { reference, awb, status, rawStatus, trackingUrl } = velocity.parseStatusWebhook(body);
    console.log(
      `[velocity-webhook] status=${rawStatus} -> ${status} ref=${reference || "-"} awb=${awb || "-"}`
    );
    if (status === "OTHER") return new NextResponse(null, { status: 200 });

    // Recover the customer from Wix. `reference` (order_external_id) is now the
    // human order NUMBER we sent to Velocity — look it up by number first, then
    // by GUID (in case an older order sent the GUID), then by AWB as a last resort.
    const order =
      (reference && (await wix.findOrderByNumber(reference))) ||
      (reference && (await wix.getOrder(reference))) ||
      (awb && (await wix.findOrderByAwb(awb))) ||
      null;
    if (!order) {
      console.warn(`[velocity-webhook] no Wix order (ref=${reference}, awb=${awb}) — cannot message.`);
      return new NextResponse(null, { status: 200 });
    }
    if (awb && !order.awb) order.awb = awb; // ensure the tracking link has a value
    // Carry a tracking URL for the dispatched message's {{3}} (webhook value,
    // else whatever Wix stored; notify falls back to building it from the AWB).
    if (trackingUrl && !order.trackingUrl) order.trackingUrl = trackingUrl;
    // NOTE: the customer product override (colour/variant changed after ordering)
    // is applied centrally in notify.js — the single choke point every template
    // send passes through — so it covers every message without wiring it here.

    if (status === "DISPATCHED") {
      // WhatsApp message #2: packed & on its way, with the tracking link.
      await dispatchOnce(order, "wa_dispatched_sent", notify.sendDispatched);
    } else if (status === "OUT_FOR_DELIVERY") {
      await dispatchOnce(order, "wa_wf2_sent", notify.sendOutForDelivery);
    } else if (status === "DELIVERED") {
      // Stamp delivery in Wix (best-effort; storefront timeline) …
      await wix.markDelivered(order.orderGuid || order.orderId, Date.now());
      await dispatchOnce(order, "wa_wf3_sent", notify.sendDelivered);
      // … and queue the WF4 review for 3 days later. ONLY a real DELIVERED gets
      // here, so in-transit orders are never queued for a review.
      await reviewQueue.enqueueDelivered(order, Date.now());
    } else if (status === "RTO") {
      // Returned to origin — never send a review. Remove it from the review
      // queue in case it was briefly marked delivered before the return.
      await reviewQueue.dequeue(order.orderId);
    } else if (status === "CANCELLED") {
      // Cancellation can also be triggered from Wix (see /api/wix-cancel-webhook).
      // Dedupe on a SHARED KV key so cancelling in one system that syncs to the
      // other still sends the customer exactly one message.
      await dispatchCancellationOnce(order);
    }
  } catch (err) {
    console.error("[velocity-webhook] processing error:", err);
  }
  return new NextResponse(null, { status: 200 });
}
