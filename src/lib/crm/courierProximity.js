// Nearest-courier-branch finder (boss's "bagal me kaunsa courier counter hai" ask).
//
// Idea (2026-11-06): for a delivery pincode, find which courier companies have a
// branch / pickup counter RIGHT THERE, with phone + public rating, and prefer that
// courier — a counter in the same locality means a real local delivery boy, far
// less fake "attempt" RTO, and the customer can even self-pickup.
//
// OpenStreetMap was validated as TOO SPARSE for Indian courier counters (dense
// Palam Vihar 122017 shows ZERO mapped courier branches), so we use a
// WEB-SEARCH-GROUNDED LLM instead: Gemini with the google_search grounding tool
// (same capability as ChatGPT browsing) returns real counters cited from the web.
//
// COST CONTROL (boss: "jyada token consumption na ho"): a grounded lookup is the
// expensive part, so — exactly like geoPincode.js — we do it AT MOST ONCE PER
// PINCODE, cache the result in KV for months, and reuse it for every order to that
// pincode. The order/ship path only ever reads the cache; the grounded network
// call happens in a background warm (cron) or an explicit dashboard "find" click.
//
//   getCourierProximity(pin)          -> cached record | null   (fast, cache-only)
//   fillCourierProximity(pin, opts)   -> record                 (does the AI call)
//   suggestNearestCourier(pin, state) -> ranked suggestion       (cache + our data)
//
// A nearby counter is NOT proof the courier home-delivers that pincode — it is a
// strong signal we use to CHOOSE/rank the carrier (combined with our own Velocity
// per-area win-rate); the actual booking still goes through a courier we integrate
// (Velocity / Shiprocket / iThink). We never invent a courier we can't book.

const NEAR_PREFIX = "courier:near:v1:";
const NEAR_TTL_S = 60 * 60 * 24 * 120; // 120 days — counters barely move; keep AI calls rare
const GEN_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Couriers we can actually ship with (via Velocity last-mile / Shiprocket / iThink
// / DTDC). A grounded counter only counts toward a suggestion if it maps here.
// value = { book: can we book it today?, aliases: match substrings (lowercased) }.
const KNOWN_COURIERS = {
  DTDC: { book: true, aliases: ["dtdc"] },
  Delhivery: { book: true, aliases: ["delhivery"] },
  Ekart: { book: true, aliases: ["ekart", "e-kart", "e kart"] },
  XpressBees: { book: true, aliases: ["xpressbees", "xpress bees", "xpressbee"] },
  Shadowfax: { book: true, aliases: ["shadowfax", "shadow fax"] },
  Bluedart: { book: true, aliases: ["blue dart", "bluedart"] },
  "India Post": { book: true, aliases: ["india post", "speed post", "indiapost", "post office", "डाकघर"] },
  Amazon: { book: false, aliases: ["amazon"] },
  Ecom: { book: false, aliases: ["ecom express", "ecomexpress"] },
  "Professional Couriers": { book: false, aliases: ["professional courier", "the professional"] },
  "Shree Maruti": { book: false, aliases: ["shree maruti", "shri maruti", "maruti courier"] },
  Trackon: { book: false, aliases: ["trackon"] },
  Gati: { book: false, aliases: ["gati"] },
  "Franch Express": { book: false, aliases: ["franch express"] },
};

function kvCfg() {
  return {
    url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/$/, ""),
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

const normPin = (pin) => String(pin || "").replace(/\D/g, "");

// Map a free-text courier name from the web to our canonical courier + bookable flag.
function canonicalCourier(name) {
  const n = String(name || "").toLowerCase();
  for (const [canon, { book, aliases }] of Object.entries(KNOWN_COURIERS)) {
    if (aliases.some((a) => n.includes(a))) return { courier: canon, bookable: book };
  }
  return null; // unknown / can't book — kept as info only
}

// Pull the first JSON object/array out of a model reply (handles ```json fences).
function parseJsonLoose(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // find the outermost [...] or {...}
  const s = t.search(/[[{]/);
  if (s === -1) return null;
  const open = t[s];
  const close = open === "[" ? "]" : "}";
  const e = t.lastIndexOf(close);
  if (e <= s) return null;
  try {
    return JSON.parse(t.slice(s, e + 1));
  } catch {
    return null;
  }
}

function geminiCfg() {
  // The free AI Studio key is GEMINI_API_KEY (boss's 2026-11-06 key). Grounding
  // needs a model that supports the google_search tool; default to flash.
  return {
    apiKey: (process.env.GEMINI_API_KEY || "").trim(),
    model: (process.env.GEMINI_PROXIMITY_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash").trim(),
  };
}

// One grounded generateContent call. Returns the raw candidate text + whether the
// model actually used Google Search (groundingMetadata present) + any API error.
// This is also how we discover, on the real prod key, whether free-tier grounding
// is even available for the project (the docs conflict for Gemini 3.x).
async function groundedGenerate(prompt) {
  const { apiKey, model } = geminiCfg();
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY not set" };
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1600 },
  };
  const url = `${GEN_BASE}/models/${model}:generateContent`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: data?.error?.message || data?.error || `HTTP ${res.status}`, model };
    }
    const cand = data?.candidates?.[0];
    const text = (cand?.content?.parts || []).map((p) => p.text).filter(Boolean).join("").trim();
    const gm = cand?.groundingMetadata || null;
    const sources = (gm?.groundingChunks || [])
      .map((c) => c?.web?.uri || c?.web?.title)
      .filter(Boolean)
      .slice(0, 12);
    const queries = gm?.webSearchQueries || [];
    return { ok: true, text, grounded: !!gm, sources, queries, model };
  } catch (error) {
    return { ok: false, error: String(error?.message || error), model };
  }
}

function buildPrompt({ pin, locality, city, state }) {
  const where = [locality, city, state].map((s) => String(s || "").trim()).filter(Boolean).join(", ");
  return [
    `You are a local-logistics researcher. Using Google Search, find courier / parcel`,
    `delivery company BRANCHES or PICKUP COUNTERS physically located in or very close to`,
    `PIN code ${pin}${where ? ` (${where})` : ""}, India.`,
    ``,
    `Only real, currently-operating counters you can cite from search results. Prefer`,
    `national couriers (DTDC, Delhivery, Blue Dart, Ekart, XpressBees, Shadowfax, India`,
    `Post/Speed Post) but include any genuine local courier counter too.`,
    ``,
    `Return ONLY a JSON array (no prose, no markdown) of up to 6 objects, nearest/most-`,
    `relevant first, each:`,
    `{"courier":"<company>","branch":"<short branch/area name>","address":"<street address>",`,
    `"phone":"<phone or empty>","rating":<google rating number or null>,"distanceNote":"<e.g. 'in Sector 1, ~0.5 km' or ''>"}`,
    ``,
    `If you genuinely find none, return []. Do not invent addresses or phone numbers.`,
  ].join("\n");
}

/**
 * Fast, cache-only read. Safe to call inline on an order/ship request — no network
 * beyond a single KV GET. Returns the cached proximity record or null.
 */
export async function getCourierProximity(pin) {
  const p = normPin(pin);
  if (p.length !== 6) return null;
  const cached = await kv(["GET", `${NEAR_PREFIX}${p}`]);
  if (!cached) return null;
  try {
    const v = typeof cached === "string" ? JSON.parse(cached) : cached;
    return v && v.pin ? v : null;
  } catch {
    return null;
  }
}

/**
 * Do the grounded lookup for a pincode and cache it. This is the EXPENSIVE path —
 * call only from a background warm (cron) or an explicit dashboard "find" action,
 * never per-order inline. One lookup per pincode is reused for all orders there.
 *
 * Returns the record even on AI failure (counters:[], with `aiError`/`grounded`
 * set) so the caller/dashboard can see exactly why — including whether grounding is
 * available on this key at all. A failed lookup is NOT cached (so it retries),
 * unless it genuinely found zero counters with grounding working.
 */
export async function fillCourierProximity(pin, { force = false, locality, city, state } = {}) {
  const p = normPin(pin);
  if (p.length !== 6) return null;
  if (!force) {
    const existing = await getCourierProximity(p);
    if (existing && existing.ok) return existing;
  }

  const gen = await groundedGenerate(buildPrompt({ pin: p, locality, city, state }));
  if (!gen.ok) {
    // Surface the failure (don't cache) so a later run / forced retry can succeed
    // and so the probe shows the real error (e.g. grounding not in free tier).
    return {
      pin: p,
      ok: false,
      grounded: false,
      counters: [],
      aiError: gen.error,
      aiStatus: gen.status || null,
      model: gen.model,
      filledAt: Date.now(),
    };
  }

  const parsed = parseJsonLoose(gen.text);
  const rows = Array.isArray(parsed) ? parsed : [];
  const counters = rows
    .map((r) => {
      const canon = canonicalCourier(r?.courier);
      const name = String(r?.courier || "").trim();
      if (!name) return null;
      return {
        courier: canon?.courier || name,
        bookable: canon ? canon.bookable : false,
        known: !!canon,
        branch: String(r?.branch || "").trim(),
        address: String(r?.address || "").trim(),
        phone: String(r?.phone || "").trim(),
        rating: typeof r?.rating === "number" ? r.rating : null,
        distanceNote: String(r?.distanceNote || "").trim(),
      };
    })
    .filter(Boolean)
    .slice(0, 6);

  const record = {
    pin: p,
    ok: true,
    grounded: !!gen.grounded,
    counters,
    sources: gen.sources || [],
    searchQueries: gen.queries || [],
    model: gen.model,
    filledAt: Date.now(),
  };
  // Cache only a successful lookup (grounded or not — a real "[]" is a valid answer
  // once the model actually searched; if it wasn't grounded we still cache so we
  // don't burn repeated calls, but mark grounded:false for visibility).
  await kv(["SET", `${NEAR_PREFIX}${p}`, JSON.stringify(record), "EX", String(NEAR_TTL_S)]);
  return record;
}

/**
 * Combine the nearby-counter signal with our OWN Velocity per-area performance to
 * recommend a courier. Cache-only + synchronous data — safe inline.
 *
 * @param {string} pin
 * @param {string} state  destination state (for carrierEngine.best3)
 * @param {{best3?:Function}} [deps]  inject best3 to avoid a hard import cycle
 * @returns {Promise<{suggested:string|null, reason:string, nearby:Array, firstToCheck:object|null}|null>}
 */
export async function suggestNearestCourier(pin, state, deps = {}) {
  const rec = await getCourierProximity(pin);
  const nearby = (rec?.counters || []).filter((c) => c.bookable);
  let best3 = [];
  try {
    best3 = typeof deps.best3 === "function" ? deps.best3(state) || [] : [];
  } catch {
    best3 = [];
  }
  const bestNames = best3.map((b) => String(b.carrier || "").toLowerCase());

  // Prefer a courier that is BOTH nearby (its own counter in the area) AND ranks
  // in our top-3 for this state. Else the nearest bookable counter. Else our #1.
  let suggested = null;
  let reason = "";
  let firstToCheck = nearby[0] || null;

  const nearbyAndGood = nearby.find((c) => bestNames.includes(c.courier.toLowerCase()));
  if (nearbyAndGood) {
    suggested = nearbyAndGood.courier;
    reason = `${nearbyAndGood.courier} has a counter right here (${nearbyAndGood.branch || nearbyAndGood.distanceNote || "in-area"}) AND is a top performer for ${state || "this area"} in our data.`;
    firstToCheck = nearbyAndGood;
  } else if (nearby.length) {
    suggested = nearby[0].courier;
    reason = `${nearby[0].courier} has the nearest bookable counter (${nearby[0].branch || nearby[0].address || "in-area"}) — a local hub means fewer fake-attempt RTOs.`;
  } else if (best3.length) {
    suggested = best3[0].carrier;
    reason = `No nearby counter found; ${best3[0].carrier} is our best performer for ${state || "this area"}.`;
  } else {
    reason = "No proximity data and no per-area history yet — operator's choice.";
  }

  return { suggested, reason, nearby, firstToCheck, grounded: !!rec?.grounded, hasData: !!rec };
}

export { KNOWN_COURIERS, canonicalCourier };
