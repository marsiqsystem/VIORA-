// Review-request queue (Workflow 4) — KV-backed, ACTUAL-delivery driven.
//
// WHY THIS EXISTS: the old flow asked Wix for `fulfillmentStatus: "FULFILLED"`
// orders and treated the order's _updatedDate as the delivery time. But in Wix
// "FULFILLED" means SHIPPED (tracking added), NOT delivered — so review requests
// went to orders still in transit or RTO'd, and (because Wix rejects our flag
// writes) repeated every cron tick. That wastes money and confuses customers.
//
// This queue is driven by the REAL Velocity "DELIVERED" webhook and lives in KV
// (Upstash) which — unlike Wix extendedFields — actually persists our writes:
//   - enqueueDelivered(order)  -> called ONLY on a genuine DELIVERED status.
//   - RTO / returned           -> dequeue(orderId), so a returned order that was
//                                 briefly delivered never gets a review.
//   - the cron sends a review 3 days after DELIVERY, exactly ONCE (SET NX claim).
//
// Result: a review goes ONLY to a customer whose product was actually delivered,
// once, 3 days later. In-transit and RTO orders never get one.
//
// Transport: the same Upstash Redis REST pattern as idempotency.js / inbox-store.
// FAIL-CLOSED for the send claim: if KV is unreachable we do NOT send (a missed
// review is fine; a duplicate/wrong review is the exact thing we're preventing).

const PREFIX = "review:";
const QUEUE_KEY = `${PREFIX}queue`; // ZSET  member=orderId  score=deliveredMs
const DATA_TTL_S = 60 * 60 * 24 * 45; // keep queued order data ~45 days

function kvCfg() {
  return {
    url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "")
      .trim()
      .replace(/\/$/, ""),
    token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim(),
  };
}
function isConfigured() {
  const { url, token } = kvCfg();
  return !!url && !!token;
}
async function command(args) {
  const { url, token } = kvCfg();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`kv command failed HTTP ${res.status}`);
  return data?.result;
}

const dataKey = (id) => `${PREFIX}data:${id}`;
const sentKey = (id) => `${PREFIX}sent:${id}`;

/**
 * Record a genuinely-delivered order so a review request can be sent 3 days later.
 * Call this ONLY from the DELIVERED status handler. Never throws.
 */
async function enqueueDelivered(order, deliveredAt = Date.now()) {
  if (!isConfigured() || !order?.orderId) return;
  const id = String(order.orderId);
  try {
    // If a review was already sent for this order, don't re-queue it.
    const already = await command(["EXISTS", sentKey(id)]).catch(() => 0);
    if (already) return;
    const data = {
      orderId: id,
      orderGuid: order.orderGuid || null,
      phone: order.phone || "",
      name: order.name || "",
      product: order.product || "",
      amount: order.amount || "",
      productImage: order.productImage || "",
      deliveredAt,
    };
    await command(["SET", dataKey(id), JSON.stringify(data), "EX", String(DATA_TTL_S)]);
    await command(["ZADD", QUEUE_KEY, String(deliveredAt), id]);
  } catch (e) {
    console.warn("[review] enqueueDelivered failed:", e?.message || e);
  }
}

/**
 * Remove an order from the review queue (e.g. it was RTO'd / returned, so no
 * review should ever go out). Never throws.
 */
async function dequeue(orderId) {
  if (!isConfigured() || !orderId) return;
  const id = String(orderId);
  try {
    await command(["ZREM", QUEUE_KEY, id]);
    await command(["DEL", dataKey(id)]);
  } catch (e) {
    console.warn("[review] dequeue failed:", e?.message || e);
  }
}

/**
 * Orders delivered at least `olderThanMs` ago and still queued. Returns the
 * stored order blobs (enough to send the review). Never throws.
 */
async function dueForReview(olderThanMs) {
  if (!isConfigured()) return [];
  const cutoff = Date.now() - olderThanMs;
  try {
    const ids = (await command(["ZRANGEBYSCORE", QUEUE_KEY, "0", String(cutoff)])) || [];
    const out = [];
    for (const id of ids) {
      const raw = await command(["GET", dataKey(id)]).catch(() => null);
      if (!raw) {
        // Data expired/missing — drop the stale queue entry.
        await command(["ZREM", QUEUE_KEY, id]).catch(() => {});
        continue;
      }
      try {
        out.push(typeof raw === "object" ? raw : JSON.parse(raw));
      } catch {
        /* skip bad blob */
      }
    }
    return out;
  } catch (e) {
    console.warn("[review] dueForReview failed:", e?.message || e);
    return [];
  }
}

/**
 * Atomically claim the one-and-only review send for an order.
 * @returns {Promise<boolean>} true = you won the claim, send now; false = already
 * sent OR KV error (fail-CLOSED: never risk a duplicate review).
 */
async function claimReview(orderId) {
  if (!isConfigured()) return false;
  try {
    const r = await command(["SET", sentKey(orderId), String(Date.now()), "NX", "EX", String(DATA_TTL_S)]);
    return r === "OK";
  } catch {
    return false; // KV hiccup -> do NOT send (avoid duplicate)
  }
}

/** Release a claim so a later tick can retry (send failed / dry-run). */
async function releaseClaim(orderId) {
  if (!isConfigured()) return;
  try {
    await command(["DEL", sentKey(orderId)]);
  } catch {
    /* best-effort */
  }
}

export { enqueueDelivered, dequeue, dueForReview, claimReview, releaseClaim, isConfigured };
