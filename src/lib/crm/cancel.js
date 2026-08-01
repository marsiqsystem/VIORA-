// Shared "order cancelled" dispatch, used by BOTH cancel triggers:
//   - /api/velocity-webhook   (status = CANCELLED)
//   - /api/wix-cancel-webhook (Wix "Order canceled" automation)
//
// The two surfaces dedupe on ONE shared Vercel KV key, so cancelling in Wix (which
// may sync to Velocity) — or vice versa — still messages the customer exactly once.
// Claim-before-send; release the claim on dry-run/failure so a real retry can still
// deliver. FAIL-OPEN: if KV is unconfigured/down the message still goes out.

import * as notify from "./notify";
import * as idempotency from "./idempotency";

const CANCEL_KEY = (orderId) => `wa_cancelled_sent:${orderId}`;

/**
 * Send the cancellation WhatsApp message at most once per order.
 * @param {{orderId:string, phone:string, name?:string, product?:string,
 *          amount?:string|number, paymentMode?:string, productImage?:string}} order
 * @returns {Promise<{sent:boolean, reason?:string}>} never throws.
 */
export async function dispatchCancellationOnce(order) {
  if (!order || !order.orderId) return { sent: false, reason: "no order id" };
  if (!order.phone) {
    console.warn(`[cancel] no phone for ${order.orderId} — skip.`);
    return { sent: false, reason: "no phone" };
  }

  const key = CANCEL_KEY(order.orderId);
  const claim = await idempotency.claimOnce(key);
  if (!claim.claimed) {
    console.log(`[cancel] already sent for ${order.orderId} — skip (idempotent).`);
    return { sent: false, reason: "already sent" };
  }

  const result = await notify.sendOrderCancelled(order);
  if (result.ok && !result.dryRun) {
    console.log(`[cancel] cancellation message sent for ${order.orderId}.`);
    return { sent: true };
  }

  // Did not actually deliver — release the claim so a later retry can send.
  await idempotency.release(key);
  if (result.dryRun) {
    console.log(`[cancel] DRY RUN for ${order.orderId} (claim released).`);
    return { sent: false, reason: "dry-run" };
  }
  console.error(`[cancel] FAILED for ${order.orderId}:`, result.error || result.data);
  return { sent: false, reason: "send failed" };
}
