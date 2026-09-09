// Shared "delivery re-attempt" dispatch, used by BOTH courier status webhooks:
//   - /api/velocity-webhook  (status = UNDELIVERED / NDR)
//   - /api/courier-webhook   (Shiprocket status = UNDELIVERED / NDR)
//
// Behaviour the business asked for:
//   * A courier may attempt delivery up to ~5 times. On EVERY failed attempt the
//     customer should get the re-attempt message, so they keep the COD ready and
//     the next attempt succeeds (cuts RTO).
//   * Couriers fire the SAME status webhook multiple times for one attempt, so we
//     must not spam. We dedupe per (order, attempt) — using the courier's attempt
//     number when the webhook carries it, else the IST calendar date (attempts are
//     ~once a day). So: one message per real attempt, not per webhook ping.
//   * COD ONLY. The approved template (delivery_reattempt_cod_v1) tells the
//     customer to keep the COD amount ready — that copy is wrong for a prepaid
//     order, so a prepaid NDR gets nothing here. (Prepaid still gets the cancelled
//     message when the shipment finally goes RTO — see cancel.js.)
//
// Claim-before-send; release the claim on dry-run/failure so a later event can
// retry. FAIL-OPEN: if KV is unconfigured/down the message still goes out.

import * as notify from "./notify";
import * as idempotency from "./idempotency";

// IST calendar day (YYYY-MM-DD) — the per-attempt bucket when the courier webhook
// carries no explicit attempt number. Attempts happen ~once a day, so this gives
// the customer at most one re-attempt message per day per order.
function istDay() {
  const d = new Date();
  // Shift UTC by +5:30 and read the date parts off the shifted clock.
  const ist = new Date(d.getTime() + (5 * 60 + 30) * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

const REATTEMPT_KEY = (orderId, token) => `wa_reattempt_sent:${orderId}:${token}`;

const isCod = (order) => String(order?.paymentMode || "").toUpperCase() === "COD";

/**
 * Send the delivery re-attempt WhatsApp message at most once per (order, attempt).
 * @param {{orderId:string, phone:string, name?:string, product?:string,
 *          amount?:string|number, paymentMode?:string, productImage?:string}} order
 * @param {string|number|null} [attempt] courier's attempt number if the webhook
 *        provided one; when absent we bucket by IST date.
 * @returns {Promise<{sent:boolean, reason?:string}>} never throws.
 */
export async function dispatchReattemptOnce(order, attempt) {
  if (!order || !order.orderId) return { sent: false, reason: "no order id" };
  if (!order.phone) {
    console.warn(`[reattempt] no phone for ${order.orderId} — skip.`);
    return { sent: false, reason: "no phone" };
  }
  // COD-only: the template body assumes a COD collection.
  if (!isCod(order)) {
    console.log(`[reattempt] ${order.orderId} is not COD (${order.paymentMode}) — skip.`);
    return { sent: false, reason: "not cod" };
  }

  const token = attempt != null && String(attempt).trim() !== "" ? `a${attempt}` : istDay();
  const key = REATTEMPT_KEY(order.orderId, token);
  const claim = await idempotency.claimOnce(key);
  if (!claim.claimed) {
    console.log(`[reattempt] already sent for ${order.orderId} @${token} — skip (idempotent).`);
    return { sent: false, reason: "already sent" };
  }

  const result = await notify.sendReattempt(order);
  if (result.ok && !result.dryRun) {
    console.log(`[reattempt] re-attempt message sent for ${order.orderId} @${token}.`);
    return { sent: true };
  }

  // Did not actually deliver — release the claim so a later retry can send.
  await idempotency.release(key);
  if (result.dryRun) {
    console.log(`[reattempt] DRY RUN for ${order.orderId} (claim released).`);
    return { sent: false, reason: "dry-run" };
  }
  console.error(`[reattempt] FAILED for ${order.orderId}:`, result.error || result.data);
  return { sent: false, reason: "send failed" };
}
