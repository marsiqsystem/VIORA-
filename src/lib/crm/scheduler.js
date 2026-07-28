// Review-request scheduler (Workflow 4) — STATELESS.
//
// No local DB: every scan asks WIX for orders delivered >= REVIEW_DELAY_DAYS ago
// that don't yet carry the wa_wf4_sent flag, and sends review_request_v1 to each,
// then sets the flag back on the Wix order.
//
// Durability comes from Wix (delivered timestamp + flag live there), so a server
// restart loses nothing — the next scan re-derives the due set from Wix.

import * as wix from "./wix";
import * as notify from "./notify";

const WF4_FLAG = "wa_wf4_sent";
const DELAY_DAYS = Number(process.env.REVIEW_DELAY_DAYS || 3);
const INTERVAL_MS = Number(process.env.REVIEW_SCAN_INTERVAL_MS || 3_600_000); // 1h

let busy = false; // guard so a slow scan can't overlap the next tick

async function processDueReviews() {
  if (busy) return;
  busy = true;
  try {
    const due = await wix.queryDeliveredNeedingReview(DELAY_DAYS * 86_400_000, WF4_FLAG);
    if (due.length) console.log(`[scheduler] ${due.length} order(s) due for a review request.`);
    for (const order of due) {
      try {
        const result = await notify.sendReviewRequest(order);
        if (result.ok && !result.dryRun) {
          await wix.setFlag(order.orderId, WF4_FLAG);
          console.log(`[scheduler] WF4 sent for ${order.orderId}.`);
        } else if (result.dryRun) {
          console.log(`[scheduler] WF4 DRY RUN for ${order.orderId} (flag not set).`);
        } else {
          console.error(`[scheduler] WF4 FAILED for ${order.orderId}:`, result.error);
        }
      } catch (err) {
        console.error(`[scheduler] review send error for ${order.orderId}:`, err);
      }
    }
  } catch (err) {
    console.error("[scheduler] Wix query failed:", err?.message || err);
  } finally {
    busy = false;
  }
}

// NOTE: on Vercel there is no long-lived process, so the old setInterval-based
// start() is gone. Instead a Vercel Cron hits /api/cron/reviews on a schedule,
// which calls processDueReviews() once per tick. Durability still comes from Wix
// (delivered timestamp + wa_wf4_sent flag), so each tick re-derives the due set.
export { processDueReviews };
