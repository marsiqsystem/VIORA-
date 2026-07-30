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

// Send a template once per (order, flag), marking the Wix flag only on a REAL
// send (dry-run leaves it unset so the pipeline can be re-run before go-live).
async function dispatchOnce(order: any, flagKey: string, sendFn: (o: any) => Promise<any>) {
  if (wix.getFlag(order, flagKey)) {
    console.log(`[velocity-webhook] ${flagKey} already set for ${order.orderId} — skip.`);
    return;
  }
  const result = await sendFn(order);
  if (result.ok && !result.dryRun) {
    await wix.setFlag(order.orderGuid || order.orderId, flagKey);
    console.log(`[velocity-webhook] ${flagKey} sent for ${order.orderId}.`);
  } else if (!result.ok) {
    console.error(`[velocity-webhook] ${flagKey} FAILED:`, result.error);
  } else {
    console.log(`[velocity-webhook] ${flagKey} DRY RUN for ${order.orderId} (flag not set).`);
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
    const { reference, awb, status, rawStatus } = velocity.parseStatusWebhook(body);
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
    if (awb && !order.awb) order.awb = awb; // ensure the tracking button has a value

    if (status === "OUT_FOR_DELIVERY") {
      await dispatchOnce(order, "wa_wf2_sent", notify.sendOutForDelivery);
    } else if (status === "DELIVERED") {
      // Stamp delivery in Wix so the review queue (WF4) can find it in 3 days.
      await wix.markDelivered(order.orderGuid || order.orderId, Date.now());
      await dispatchOnce(order, "wa_wf3_sent", notify.sendDelivered);
    }
  } catch (err) {
    console.error("[velocity-webhook] processing error:", err);
  }
  return new NextResponse(null, { status: 200 });
}
