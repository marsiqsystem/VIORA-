// Review-request scheduler (Workflow 4) — STATELESS, KV-backed.
//
// A review request goes ONLY to a customer whose product was ACTUALLY delivered
// (Velocity "DELIVERED" webhook enqueues it), exactly ONCE, REVIEW_DELAY_DAYS
// after delivery. In-transit and RTO/returned orders never get one.
//
// The due set + once-only dedupe live in KV (see reviewQueue.js) because Wix
// rejects our extendedFields writes, so the OLD Wix "FULFILLED" query + flag
// approach both mis-selected shipped-but-not-delivered orders AND re-sent every
// tick. Durability is in KV, so a missed cron tick is picked up on the next run.

import * as notify from "./notify";
import * as reviewQueue from "./reviewQueue";

const DELAY_DAYS = Number(process.env.REVIEW_DELAY_DAYS || 2);

let busy = false; // guard so a slow scan can't overlap the next tick

async function processDueReviews() {
  if (busy) return;
  busy = true;
  try {
    const due = await reviewQueue.dueForReview(DELAY_DAYS * 86_400_000);
    if (due.length) console.log(`[scheduler] ${due.length} order(s) due for a review request.`);
    for (const order of due) {
      const id = order.orderId;
      // Claim the single allowed send BEFORE sending (fail-closed: no claim -> skip).
      const won = await reviewQueue.claimReview(id);
      if (!won) {
        // Already sent (or KV hiccup) — drop it from the queue so we don't re-scan it.
        await reviewQueue.dequeue(id);
        continue;
      }
      try {
        const result = await notify.sendReviewRequest(order);
        if (result.ok && !result.dryRun) {
          await reviewQueue.dequeue(id); // done — remove from the queue
          console.log(`[scheduler] WF4 review sent for ${id}.`);
        } else {
          // Dry-run or failure: release the claim so a later tick can retry.
          await reviewQueue.releaseClaim(id);
          if (result.dryRun) console.log(`[scheduler] WF4 DRY RUN for ${id} (claim released).`);
          else console.error(`[scheduler] WF4 FAILED for ${id}:`, result.error);
        }
      } catch (err) {
        await reviewQueue.releaseClaim(id);
        console.error(`[scheduler] review send error for ${id}:`, err);
      }
    }
  } catch (err) {
    console.error("[scheduler] review scan failed:", err?.message || err);
  } finally {
    busy = false;
  }
}

// On Vercel a Cron hits /api/cron/reviews on a schedule and calls this once per
// tick. Durability comes from KV (delivered timestamp + once-only claim).
export { processDueReviews };
