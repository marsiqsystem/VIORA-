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

// --- Fuller pincode data (district + state + the post-office AREA names) -------
// Same India Post source as lookupPincode, but also returns every PostOffice
// Name for the pincode (the real localities). Cached separately. Never throws.
const PIN_AREAS_PREFIX = "pincode:areas:v1:";
async function lookupPincodeAreas(pin) {
  const p = String(pin || "").replace(/\D/g, "");
  if (p.length !== 6) return { city: "", state: "", areas: [] };
  const cached = await kv(["GET", `${PIN_AREAS_PREFIX}${p}`]);
  if (cached) {
    try {
      const v = typeof cached === "string" ? JSON.parse(cached) : cached;
      if (v && v.state) return { city: v.city || "", state: v.state || "", areas: Array.isArray(v.areas) ? v.areas : [] };
    } catch { /* fall through */ }
  }
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${p}`, { headers: { Accept: "application/json" } });
    const data = await res.json().catch(() => null);
    const first = Array.isArray(data) ? data[0] : null;
    const pos = Array.isArray(first?.PostOffice) ? first.PostOffice : [];
    if (first?.Status === "Success" && pos.length) {
      const po0 = pos[0];
      const areas = [...new Set(pos.map((x) => String(x?.Name || "").trim()).filter(Boolean))];
      const out = { city: po0.District || po0.Division || po0.Region || "", state: po0.State || "", areas };
      await kv(["SET", `${PIN_AREAS_PREFIX}${p}`, JSON.stringify(out), "EX", String(PIN_CACHE_TTL_S)]);
      return out;
    }
  } catch { /* network blip */ }
  return { city: "", state: "", areas: [] };
}

// --- Shipping address enricher ------------------------------------------------
// Run right before a parcel is handed to a courier. It (1) STANDARDISES city +
// state against the pincode's authoritative India Post data (couriers route by
// pincode, so a wrong state causes failed deliveries), (2) NEVER drops any line,
// and (3) only when the street text is genuinely thin AND the pincode maps to a
// SINGLE unambiguous post-office area, appends that REAL locality as a reference
// — it never invents a landmark and never guesses among multiple areas. Returns
// the (possibly) enriched address plus flags. Best-effort: on any failure it
// returns the original address untouched so shipping is never blocked.
const _norm = (s) => String(s || "").trim().toLowerCase();
const _alnum = (s) => String(s || "").replace(/[^a-z0-9]/gi, "").length;
async function enrichShippingAddress(address) {
  const a = { ...(address || {}) };
  const pin = String(a.postalCode || "").replace(/\D/g, "");
  const res = { address: a, standardized: false, localityAdded: "", stillThin: false, pin };
  const streetLen = () => _alnum([a.line1, a.line2, a.line3].filter(Boolean).join(" "));
  if (pin.length !== 6) { res.stillThin = streetLen() < 12; return res; }

  let info;
  try { info = await lookupPincodeAreas(pin); } catch { info = { city: "", state: "", areas: [] }; }
  if (!info.state) { res.stillThin = streetLen() < 12; return res; } // unresolved — leave as-is

  // (1) Standardise. State: align to the pincode when clearly different (routing
  // truth). City: only FILL when missing — never overwrite a non-empty city.
  if (info.state && _norm(a.state || "") !== _norm(info.state)) { a.state = info.state; res.standardized = true; }
  if (info.city && !String(a.city || "").trim()) { a.city = info.city; res.standardized = true; }

  // (3) Locality append — thin street text + exactly one post-office area that
  // isn't already mentioned. Conservative on purpose (no wrong guesses).
  const street = [a.line1, a.line2, a.line3].filter(Boolean).join(" ").trim();
  const thin = _alnum(street) < 12;
  const inText = info.areas.some((ar) => _norm(street).includes(_norm(ar))) || (!!info.city && _norm(street).includes(_norm(info.city)));
  if (thin && !inText && info.areas.length === 1 && info.areas[0]) {
    const loc = `near ${info.areas[0]}${info.city ? `, ${info.city}` : ""}`;
    a.line3 = [a.line3, loc].filter(Boolean).join(", ");
    res.localityAdded = loc;
  }

  res.address = a;
  res.stillThin = _alnum([a.line1, a.line2, a.line3].filter(Boolean).join(" ")) < 8 && !res.localityAdded;
  return res;
}

export { extractPincode, lookupPincode, lookupPincodeAreas, buildStructuredAddress, enrichShippingAddress };
