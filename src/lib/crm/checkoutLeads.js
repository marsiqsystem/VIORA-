// Checkout reminders (abandoned checkout) — KV-backed, like reviewQueue.js.
//
// WHY THIS EXISTS: the checkout modal only creates a Wix checkout when the
// shopper taps Pay, so Wix's own "Abandoned Checkout" automation
// (/api/wix-abandoned) never sees anyone who fills in their details and leaves.
// The modal therefore saves the shopper's phone + cart here as soon as a valid
// number is typed (unless they untick the reminder). If no order follows, the
// cron (/api/cron/checkout-reminders) sends ONE WhatsApp reminder with a link
// that restores the cart on any device (/recover/<id>). A placed order removes
// the lead.
//
// Transport: the same Upstash Redis REST pattern as idempotency.js.

const PREFIX = "ckl:";
const DUE_KEY = `${PREFIX}due`; // ZSET  member=leadId  score=last activity (ms)
const DATA_TTL_S = 60 * 60 * 24 * 3; // lead + recovery link live 3 days
const SENT_TTL_S = 60 * 60 * 24 * 7; // at most one reminder per phone per week
const RATE_WINDOW_S = 60 * 60;
const RATE_LIMIT = 30; // lead saves per IP per hour

const REMINDER_DELAY_MS = Number(process.env.CHECKOUT_REMINDER_DELAY_MIN || 60) * 60_000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // don't remind about a checkout older than a day

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
const phoneKey = (phone) => `${PREFIX}phone:${phone}`;
const sentKey = (phone) => `${PREFIX}sent:${phone}`;
const ipKey = (ip) => `${PREFIX}ip:${ip}`;

const parse = (raw) => {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** Simple per-IP cap so the endpoint can't be used to queue messages to arbitrary numbers. */
async function allowRequest(ip) {
  if (!isConfigured() || !ip) return true;
  try {
    const count = Number(await command(["INCR", ipKey(ip)]));
    if (count === 1) await command(["EXPIRE", ipKey(ip), String(RATE_WINDOW_S)]);
    return count <= RATE_LIMIT;
  } catch {
    return true;
  }
}

/**
 * Create or refresh the lead for this phone (one lead per phone). The reminder
 * clock restarts on every save, so it only fires after the shopper goes quiet.
 * @returns {Promise<string|null>} lead id. Never throws.
 */
async function saveLead(lead) {
  if (!isConfigured() || !lead?.phone) return null;
  try {
    const existing = await command(["GET", phoneKey(lead.phone)]);
    const id = existing || globalThis.crypto.randomUUID();
    const now = Date.now();
    await command(["SET", dataKey(id), JSON.stringify({ ...lead, id, updatedAt: now }), "EX", String(DATA_TTL_S)]);
    await command(["SET", phoneKey(lead.phone), id, "EX", String(DATA_TTL_S)]);
    await command(["ZADD", DUE_KEY, String(now), id]);
    return id;
  } catch (e) {
    console.warn("[checkout-leads] saveLead failed:", e?.message || e);
    return null;
  }
}

/** The stored lead, or null. Never throws. */
async function getLead(id) {
  if (!isConfigured() || !id) return null;
  try {
    return parse(await command(["GET", dataKey(id)]));
  } catch {
    return null;
  }
}

/** Forget a phone's lead entirely — it ordered, or opted out. Never throws. */
async function removeByPhone(phone) {
  if (!isConfigured() || !phone) return;
  try {
    const id = await command(["GET", phoneKey(phone)]);
    if (id) {
      await command(["ZREM", DUE_KEY, id]);
      await command(["DEL", dataKey(id)]);
    }
    await command(["DEL", phoneKey(phone)]);
  } catch (e) {
    console.warn("[checkout-leads] removeByPhone failed:", e?.message || e);
  }
}

/** Leads quiet for at least the reminder delay (and not older than a day). Never throws. */
async function dueLeads() {
  if (!isConfigured()) return [];
  try {
    const cutoff = Date.now() - REMINDER_DELAY_MS;
    const ids = (await command(["ZRANGEBYSCORE", DUE_KEY, "0", String(cutoff)])) || [];
    const out = [];
    for (const id of ids) {
      const lead = parse(await command(["GET", dataKey(id)]).catch(() => null));
      if (!lead || Date.now() - Number(lead.updatedAt || 0) > MAX_AGE_MS) {
        await command(["ZREM", DUE_KEY, id]).catch(() => {});
        continue;
      }
      out.push(lead);
    }
    return out;
  } catch (e) {
    console.warn("[checkout-leads] dueLeads failed:", e?.message || e);
    return [];
  }
}

/** Take a lead off the reminder queue; its data stays so the recovery link keeps working. */
async function markDone(id) {
  if (!isConfigured() || !id) return;
  try {
    await command(["ZREM", DUE_KEY, id]);
  } catch {
    /* best-effort */
  }
}

/** Claim the week's single reminder for a phone. Fail-closed: a KV error means no send. */
async function claimReminder(phone) {
  if (!isConfigured() || !phone) return false;
  try {
    return (await command(["SET", sentKey(phone), String(Date.now()), "NX", "EX", String(SENT_TTL_S)])) === "OK";
  } catch {
    return false;
  }
}

async function releaseReminder(phone) {
  if (!isConfigured() || !phone) return;
  try {
    await command(["DEL", sentKey(phone)]);
  } catch {
    /* best-effort */
  }
}

export {
  allowRequest,
  saveLead,
  getLead,
  removeByPhone,
  dueLeads,
  markDone,
  claimReminder,
  releaseReminder,
  isConfigured,
};
