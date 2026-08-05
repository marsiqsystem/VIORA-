// Broadcast send-log storage — records every CSV broadcast so an operator can
// see history (what template went to how many, how many sent/failed).
//
// Same Upstash Redis REST transport as inbox-store.js / idempotency.js (one
// command POSTed as a JSON array). Non-throwing: a logging outage must never
// abort a broadcast that is actually reaching customers.
//
// KEY LAYOUT (all under `bcast:` prefix):
//   bcast:index          ZSET  member=id           score=createdMs  (newest first)
//   bcast:<id>           STR   JSON summary  {id,templateName,lang,createdAt,total,sent,failed,updatedAt}
//   bcast:fail:<id>      LIST  JSON {phone,error}  (capped — a sample of failures for review)

const PREFIX = "bcast:";
const INDEX_KEY = `${PREFIX}index`;
const FAIL_CAP = 200;

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

function safeParse(str, fallback) {
  if (str == null) return fallback;
  if (typeof str === "object") return str;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function key(id) {
  return `${PREFIX}${id}`;
}
function failKey(id) {
  return `${PREFIX}fail:${id}`;
}

/** Read one broadcast summary (or null). Never throws. */
async function getBroadcast(id) {
  if (!isConfigured() || !id) return null;
  try {
    return safeParse(await command(["GET", key(id)]), null);
  } catch {
    return null;
  }
}

/**
 * Ensure a broadcast summary exists (first batch creates it). Idempotent — a
 * later batch with the same id keeps the original createdAt/total.
 */
async function ensureBroadcast({ id, templateName, lang, total }) {
  if (!isConfigured() || !id) return null;
  try {
    const existing = await getBroadcast(id);
    if (existing) return existing;
    const now = Date.now();
    const summary = {
      id,
      templateName: templateName || "",
      lang: lang || "",
      createdAt: now,
      total: Number(total) || 0,
      sent: 0,
      failed: 0,
      updatedAt: now,
    };
    await command(["SET", key(id), JSON.stringify(summary)]);
    await command(["ZADD", INDEX_KEY, now, id]);
    return summary;
  } catch {
    return null;
  }
}

/**
 * Add a batch's results to a broadcast's running totals. `failures` is an array
 * of {phone,error} appended (capped) for later review. Never throws.
 */
async function bumpBroadcast(id, { sent = 0, failed = 0, failures = [] } = {}) {
  if (!isConfigured() || !id) return;
  try {
    const summary = (await getBroadcast(id)) || {
      id,
      templateName: "",
      lang: "",
      createdAt: Date.now(),
      total: 0,
      sent: 0,
      failed: 0,
    };
    summary.sent = (Number(summary.sent) || 0) + sent;
    summary.failed = (Number(summary.failed) || 0) + failed;
    summary.updatedAt = Date.now();
    await command(["SET", key(id), JSON.stringify(summary)]);
    if (failures.length) {
      await command(["RPUSH", failKey(id), ...failures.map((f) => JSON.stringify(f))]);
      await command(["LTRIM", failKey(id), -FAIL_CAP, -1]);
    }
  } catch {
    /* best-effort */
  }
}

/** List broadcasts, newest first. Never throws. */
async function listBroadcasts(limit = 50) {
  if (!isConfigured()) return [];
  try {
    const ids = (await command(["ZREVRANGE", INDEX_KEY, 0, Math.max(0, limit - 1)])) || [];
    if (!ids.length) return [];
    const blobs = (await command(["MGET", ...ids.map(key)])) || [];
    return ids.map((id, i) => safeParse(blobs[i], { id })).filter(Boolean);
  } catch {
    return [];
  }
}

export { isConfigured, ensureBroadcast, bumpBroadcast, getBroadcast, listBroadcasts };
