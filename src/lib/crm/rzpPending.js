// Pending-prepaid-order snapshot store (KV-backed), so a Razorpay
// `payment.captured` webhook can create the Wix order even when the browser
// never finished the client-side finalize (tab closed, network drop, Wix hiccup
// after the money was already captured). WHY: the Wix order is normally created
// by the browser AFTER payment; any failure there = money taken, no order (an
// "orphan"). This snapshot lets the server rebuild the order from scratch.
//
// Flow:
//   1. /api/razorpay (order create) stores { items, details, amount } keyed by
//      the Razorpay order_id, short TTL.
//   2. The browser's normal success path creates the order via /api/wix/checkout
//      and DELETES this snapshot (markHandled) — so a captured payment whose
//      snapshot is gone means the client already succeeded.
//   3. /api/razorpay-webhook, on payment.captured, waits a grace window then, if
//      the snapshot is STILL present, creates the order itself (the client
//      failed) and deletes it.
//
// Transport mirrors idempotency.js (Upstash/Vercel KV REST via fetch). FAIL-SAFE:
// never throws; a KV outage degrades gracefully (snapshot just won't persist,
// which only disables the fallback — it never blocks a real order).

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
  if (!res.ok) {
    const err = new Error(`kv command failed HTTP ${res.status}`);
    err.data = data;
    throw err;
  }
  return data?.result;
}

const KEY = (orderId) => `rzp_pending:${String(orderId || "").trim()}`;
const DEFAULT_TTL = 60 * 60 * 24 * 14; // 14 days

/** Persist the snapshot for a Razorpay order. Best-effort; never throws. */
async function savePending(orderId, snapshot, ttlSeconds = DEFAULT_TTL) {
  if (!orderId || !isConfigured()) return false;
  try {
    await command(["SET", KEY(orderId), JSON.stringify(snapshot || {}), "EX", String(ttlSeconds)]);
    return true;
  } catch (e) {
    console.warn("[rzpPending] savePending failed:", e?.message || e);
    return false;
  }
}

/** Read the snapshot (or null). Never throws. */
async function getPending(orderId) {
  if (!orderId || !isConfigured()) return null;
  try {
    const raw = await command(["GET", KEY(orderId)]);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    console.warn("[rzpPending] getPending failed:", e?.message || e);
    return null;
  }
}

/** Delete the snapshot — call once the order has been created (either path). */
async function markHandled(orderId) {
  if (!orderId || !isConfigured()) return;
  try {
    await command(["DEL", KEY(orderId)]);
  } catch (e) {
    console.warn("[rzpPending] markHandled failed:", e?.message || e);
  }
}

export { savePending, getPending, markHandled, isConfigured };
