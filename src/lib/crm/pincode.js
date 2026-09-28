// Indian pincode helpers for the dashboard "edit address" feature.
//
//  extractPincode(text)  -> the 6-digit pincode found in a free-text address (or "")
//  lookupPincode(pin)    -> { city, state } derived from the pincode via India Post's
//                           public API (api.postalpincode.in), cached in KV.
//
// Both are best-effort and NEVER throw — a failure just means "couldn't resolve",
// and the caller keeps whatever the operator typed.

const PIN_CACHE_PREFIX = "pincode:v1:";
const PIN_CACHE_TTL_S = 60 * 60 * 24 * 180; // 6 months — pincodes are stable

function kvCfg() {
  return {
    url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "")
      .trim()
      .replace(/\/$/, ""),
    token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim(),
  };
}

async function kv(args) {
  const { url, token } = kvCfg();
  if (!url || !token) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? (data?.result ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Pull the 6-digit Indian pincode out of a free-text address. Accepts an optional
 * single space in the middle ("396 560"). Ignores longer digit runs (e.g. a
 * 10-digit phone number) via word boundaries. Returns "" when none is found.
 */
function extractPincode(text) {
  const s = String(text || "");
  // Prefer a clean 6-digit token; then a "3+3 with a space" form.
  const m =
    s.match(/\b([1-9]\d{5})\b/) ||
    s.match(/\b([1-9]\d{2})\s(\d{3})\b/);
  if (!m) return "";
  return (m[1] + (m[2] || "")).replace(/\D/g, "");
}

/**
 * Resolve a pincode to { city, state } (city = the postal District). Cached in KV.
 * Returns { city:"", state:"" } when it can't be resolved. Never throws.
 */
async function lookupPincode(pin) {
  const p = String(pin || "").replace(/\D/g, "");
  if (p.length !== 6) return { city: "", state: "" };

  // Cache first.
  const cached = await kv(["GET", `${PIN_CACHE_PREFIX}${p}`]);
  if (cached) {
    try {
      const v = typeof cached === "string" ? JSON.parse(cached) : cached;
      if (v && (v.city || v.state)) return { city: v.city || "", state: v.state || "" };
    } catch {
      /* fall through to a fresh lookup */
    }
  }

  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${p}`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(() => null);
    const first = Array.isArray(data) ? data[0] : null;
    const po = first?.PostOffice?.[0] || null;
    if (first?.Status === "Success" && po) {
      const out = {
        city: po.District || po.Division || po.Region || "",
        state: po.State || "",
      };
      // Cache the hit (best-effort).
      await kv(["SET", `${PIN_CACHE_PREFIX}${p}`, JSON.stringify(out), "EX", String(PIN_CACHE_TTL_S)]);
      return out;
    }
  } catch {
    /* network / API blip — treat as unresolved */
  }
  return { city: "", state: "" };
}

/**
 * Turn a free-text (multi-line or comma-separated) address into the structured
 * shape the couriers consume: { line1, line2, line3, city, state, postalCode,
 * country, raw }. City/state/pincode passed in (already resolved) win over
 * anything parsed here. NEVER throws.
 */
function buildStructuredAddress(text, { pincode = "", city = "", state = "", country = "India" } = {}) {
  const raw = String(text || "").trim();
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const line1 = lines[0] || raw;
  const line2 = lines[1] || "";
  const line3 = lines.slice(2).join(", ");
  return {
    line1,
    line2,
    line3,
    city: city || "",
    state: state || "",
    postalCode: String(pincode || "").replace(/\D/g, ""),
    country: country || "India",
    raw,
  };
}

export { extractPincode, lookupPincode, buildStructuredAddress };
