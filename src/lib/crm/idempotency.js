// KV-backed idempotency for one-time actions (e.g. "WF1 order-confirmation
// already sent for order X").
//
// WHY THIS EXISTS: the server is stateless (Vercel), so we need an EXTERNAL
// place to record "already done". Wix — our normal datastore — refuses our
// API-key writes for this: order `extendedFields` require a registered
// namespace/schema (we get INVALID_PATCH "verify namespace '@viora/whatsapp'
// exists"), and `customFields` aren't in updateOrder's field mask. So a tiny
// Redis (Vercel KV / Upstash) key-value store holds the dedupe markers instead.
//
// Transport: the Upstash Redis REST API via plain fetch — NO SDK dependency.
// A single command is POSTed as a JSON array, e.g. ["SET", key, val, "NX",
// "EX", ttl]; the response is { result: "OK" | null | ... }.
//
// Env (set by the Vercel KV / Upstash integration; either name works):
//   KV_REST_API_URL   or  UPSTASH_REDIS_REST_URL
//   KV_REST_API_TOKEN or  UPSTASH_REDIS_REST_TOKEN
//
// FAIL-OPEN: if KV is unconfigured or errors, claimOnce reports the key as
// claimed (degraded:true) so a real customer message is NEVER blocked by an
// idempotency-store outage — a rare duplicate is far better than a missed
// confirmation. Nothing here ever throws.

function kvCfg() {
  return {
    url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "")
      .trim()
      .replace(/\/$/, ""),
    token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim(),
  };
}

/** True when a Redis KV is actually configured for this deployment. */
function isConfigured() {
  const { url, token } = kvCfg();
  return !!url && !!token;
}

/** POST one Redis command as a JSON array; returns the parsed `result` (or throws). */
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

/**
 * Atomically claim a one-time key (SET key <ts> NX EX ttl).
 * @returns {Promise<{claimed:boolean, degraded:boolean}>}
 *   claimed=true  -> THIS caller won the claim (first time): proceed.
 *   claimed=false -> the key already existed: a duplicate — skip the action.
 *   degraded=true -> KV was unconfigured/errored, so we FAIL-OPEN (claimed=true).
 * Never throws.
 */
async function claimOnce(key, ttlSeconds = 60 * 60 * 24 * 30) {
  if (!isConfigured()) {
    console.warn("[idempotency] KV not configured — proceeding without dedupe.");
    return { claimed: true, degraded: true };
  }
  try {
    const result = await command(["SET", key, String(Date.now()), "NX", "EX", String(ttlSeconds)]);
    // "OK" => we set it (first claim). null => key already present (duplicate).
    return { claimed: result === "OK", degraded: false };
  } catch (e) {
    console.warn("[idempotency] claimOnce failed — proceeding (fail-open):", e?.message || e);
    return { claimed: true, degraded: true };
  }
}

/**
 * Release a previously-claimed key (DEL) so a later retry may claim it again.
 * Call this when the guarded action did NOT actually complete (send failed or
 * was a dry-run), otherwise the claim would permanently block a real send.
 * Best-effort; never throws.
 */
async function release(key) {
  if (!isConfigured()) return;
  try {
    await command(["DEL", key]);
  } catch (e) {
    console.warn("[idempotency] release failed:", e?.message || e);
  }
}

export { claimOnce, release, isConfigured };
