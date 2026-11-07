// Nearest-courier-branch finder (boss's "bagal me kaunsa courier counter hai" ask).
//
// Goal: for a delivery pincode, find which courier companies have a branch / pickup
// counter RIGHT THERE, with phone + public rating, and prefer that courier — a
// local counter means a real local delivery boy (far fewer fake "attempt" RTOs) and
// the customer can even self-pickup.
//
// WHY NOT the obvious options:
//   • OpenStreetMap  — validated TOO SPARSE for Indian courier counters (dense
//                      Palam Vihar 122017 shows ~zero mapped courier branches).
//   • Gemini + google_search grounding — the model's own web search. Clean, but
//     Google gives grounding ZERO free-tier quota (instant 429 "enable billing")
//     on our free AI Studio project. Boss wants this WITHOUT billing.
//
// THE FREE WAY (boss: no billing): decouple "search" from "understand". WE do the
// web search for free (DuckDuckGo + OpenStreetMap Nominatim free-text — no API key),
// then feed the raw result text to PLAIN Gemini (no grounding tool — proven to work
// on the free key) just to STRUCTURE + rank it. The LLM never searches (the gated
// part); it only cleans text we already fetched. If the LLM is unavailable we still
// return a heuristic parse of the search text, so the engine never fully depends on
// AI (boss's rule).
//
// COST / RATE CONTROL (boss: "jyada token consumption na ho"): exactly like
// geoPincode.js, a lookup runs AT MOST ONCE PER PINCODE, is cached in KV for months,
// and reused for every order to that pincode. The order/ship path only reads the
// cache; the network work happens in a background warm (cron) or an explicit
// dashboard "find" click.
//
//   getCourierProximity(pin)          -> cached record | null   (fast, cache-only)
//   fillCourierProximity(pin, opts)   -> record                 (does the lookup)
//   suggestNearestCourier(pin, state) -> ranked suggestion        (cache + our data)
//
// A nearby counter is NOT proof the courier home-delivers that pincode — it is a
// strong signal we use to CHOOSE/rank the carrier (combined with our own Velocity
// per-area win-rate); the actual booking still goes through a courier we integrate.

const NEAR_PREFIX = "courier:near:v1:";
const NEAR_TTL_S = 60 * 60 * 24 * 120; // 120 days — counters barely move; keep lookups rare
const GEN_BASE = "https://generativelanguage.googleapis.com/v1beta";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const NOMINATIM_UA = "viora-shipping-courier-finder/1.0 (viorajewel.in)";

// Couriers we can actually ship with (via Velocity last-mile / Shiprocket / iThink
// / DTDC). A found counter only counts toward a suggestion if it maps here.
// value = { book: can we book it today?, aliases: match substrings (lowercased) }.
const KNOWN_COURIERS = {
  DTDC: { book: true, aliases: ["dtdc"] },
  Delhivery: { book: true, aliases: ["delhivery"] },
  Ekart: { book: true, aliases: ["ekart", "e-kart", "e kart"] },
  XpressBees: { book: true, aliases: ["xpressbees", "xpress bees", "xpressbee"] },
  Shadowfax: { book: true, aliases: ["shadowfax", "shadow fax"] },
  Bluedart: { book: true, aliases: ["blue dart", "bluedart"] },
  "India Post": { book: true, aliases: ["india post", "speed post", "indiapost", "post office"] },
  Amazon: { book: false, aliases: ["amazon"] },
  Ecom: { book: false, aliases: ["ecom express", "ecomexpress"] },
  "Professional Couriers": { book: false, aliases: ["professional courier", "the professional"] },
  "Shree Maruti": { book: false, aliases: ["shree maruti", "shri maruti", "maruti courier"] },
  Trackon: { book: false, aliases: ["trackon"] },
  Gati: { book: false, aliases: ["gati"] },
  "First Flight": { book: false, aliases: ["first flight"] },
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

// Map a free-text courier name to our canonical courier + bookable flag.
function canonicalCourier(name) {
  const n = String(name || "").toLowerCase();
  for (const [canon, { book, aliases }] of Object.entries(KNOWN_COURIERS)) {
    if (aliases.some((a) => n.includes(a))) return { courier: canon, bookable: book };
  }
  return null; // unknown / can't book — kept as info only
}

const stripTags = (s) =>
  String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ---------------------------------------------------------------------------
// FREE search layer — no API key. Returns candidate listing text + source URLs.
// ---------------------------------------------------------------------------

// DuckDuckGo HTML results (title + snippet per hit). Falls back to the lite host.
async function duckduckgo(query) {
  const hosts = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
  ];
  for (const url of hosts) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const html = await r.text();
      const titles = [...html.matchAll(/result__a[^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1]));
      const snips = [...html.matchAll(/result__snippet[^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1]));
      const liteCells = titles.length ? [] : [...html.matchAll(/<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => stripTags(m[1]));
      const lines = [];
      const n = Math.max(titles.length, snips.length);
      for (let i = 0; i < n; i++) {
        const t = titles[i] || "";
        const s = snips[i] || "";
        const line = [t, s].filter(Boolean).join(" — ");
        if (line) lines.push(line);
      }
      const all = lines.concat(liteCells).filter(Boolean);
      if (all.length) return all.slice(0, 12);
    } catch {
      /* try next host */
    }
  }
  return [];
}

// Nominatim free-text search — finds mapped, named courier businesses near a pin.
async function nominatimCourier(pin, city) {
  try {
    const q = encodeURIComponent(`courier ${pin} ${city || ""}`.trim());
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&addressdetails=1&limit=8`, {
      headers: { "User-Agent": NOMINATIM_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return [];
    const arr = await r.json().catch(() => []);
    return (Array.isArray(arr) ? arr : []).map((h) => String(h.display_name || "").trim()).filter(Boolean).slice(0, 8);
  } catch {
    return [];
  }
}

// Gather raw candidate listings for a pincode from the free sources.
async function freeSearchCandidates({ pin, locality, city, state }) {
  const where = [locality, city, state].map((s) => String(s || "").trim()).filter(Boolean).join(" ");
  const [ddg, nom] = await Promise.all([
    duckduckgo(`courier counter branch ${where} ${pin} address phone`),
    nominatimCourier(pin, city || state),
  ]);
  const candidates = [...ddg, ...nom.map((n) => `OSM: ${n}`)];
  // de-dupe near-identical lines
  const seen = new Set();
  const uniq = [];
  for (const c of candidates) {
    const k = c.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
    if (k && !seen.has(k)) {
      seen.add(k);
      uniq.push(c);
    }
  }
  return uniq.slice(0, 16);
}

// ---------------------------------------------------------------------------
// Understand layer — plain Gemini (NO grounding) structures the fetched text.
// ---------------------------------------------------------------------------

function geminiCfg() {
  return {
    apiKey: (process.env.GEMINI_API_KEY || "").trim(),
    model: (process.env.GEMINI_PROXIMITY_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash").trim(),
  };
}

// Non-grounded generateContent. Set opts.grounding=true only if billing is enabled
// (default false — the free path). Returns the candidate text or an error.
async function geminiGenerate(prompt, opts = {}) {
  const cfg = geminiCfg();
  const apiKey = cfg.apiKey;
  const model = opts.model || cfg.model;
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY not set" };
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1600 },
  };
  if (opts.grounding === true) body.tools = [{ google_search: {} }];
  const url = `${GEN_BASE}/models/${model}:generateContent`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(40000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: data?.error?.message || `HTTP ${res.status}`, model };
    const cand = data?.candidates?.[0];
    const text = (cand?.content?.parts || []).map((p) => p.text).filter(Boolean).join("").trim();
    const grounded = !!cand?.groundingMetadata;
    return { ok: true, text, grounded, model };
  } catch (error) {
    return { ok: false, error: String(error?.message || error), model };
  }
}

function parseJsonLoose(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
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

function extractPrompt({ pin, locality, city, state }, candidates) {
  const where = [locality, city, state].map((s) => String(s || "").trim()).filter(Boolean).join(", ");
  return [
    `Below are raw web/map search result lines about courier / parcel-delivery`,
    `counters near PIN ${pin}${where ? ` (${where})` : ""}, India. Extract the REAL`,
    `courier branches mentioned. Use ONLY facts present in the lines — do NOT invent`,
    `addresses, phones or ratings. Merge duplicates of the same branch.`,
    ``,
    `Return ONLY a JSON array (no prose, no markdown), best/nearest first, up to 6:`,
    `{"courier":"<company>","branch":"<short area/branch>","address":"<street address if present>",`,
    `"phone":"<phone if present else ''>","rating":<number or null>,"distanceNote":"<area note or ''>"}`,
    ``,
    `If no real courier counter appears, return [].`,
    ``,
    `--- SEARCH RESULTS ---`,
    ...candidates.map((c, i) => `${i + 1}. ${c}`),
  ].join("\n");
}

// Heuristic fallback — parse counters straight from the search text, no AI. Keeps
// the engine working when the LLM is down (boss's "don't depend on AI" rule).
function heuristicCounters(candidates) {
  const out = [];
  const seen = new Set();
  for (const line of candidates) {
    const canon = canonicalCourier(line);
    if (!canon) continue;
    const phone = (line.match(/(?:\+?91[\s-]?)?[6-9]\d{9}\b/) || line.match(/\b0\d{9,10}\b/) || [""])[0];
    const rating = Number((line.match(/\b([1-5](?:\.\d)?)\s*(?:star|\/\s*5|cybo score|rating)/i) || [])[1]) || null;
    const key = canon.courier.toLowerCase() + "|" + (phone || line.slice(0, 30).toLowerCase());
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      courier: canon.courier,
      bookable: canon.bookable,
      known: true,
      branch: "",
      address: line.replace(/^OSM:\s*/, "").slice(0, 160),
      phone: phone || "",
      rating,
      distanceNote: "",
    });
    if (out.length >= 6) break;
  }
  return out;
}

// ---------------------------------------------------------------------------

/**
 * Fast, cache-only read. Safe inline on an order/ship request — one KV GET, no
 * network search. Returns the cached proximity record or null.
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
 * Do the (free) nearby-counter lookup for a pincode and cache it. The EXPENSIVE
 * path — call only from a background warm (cron) or an explicit dashboard "find",
 * never per-order inline. One lookup per pincode is reused for all orders there.
 *
 * Pipeline: free web/map search -> plain Gemini structuring (grounding OFF) ->
 * heuristic fallback if the LLM is unavailable. opts.grounding=true is the paid
 * path (only if billing is ever enabled). Diagnostic runs are never cached.
 */
export async function fillCourierProximity(pin, { force = false, locality, city, state, grounding = false, model } = {}) {
  const p = normPin(pin);
  if (p.length !== 6) return null;
  if (!force) {
    const existing = await getCourierProximity(p);
    if (existing && existing.ok) return existing;
  }

  // Paid shortcut: if billing is enabled, let Gemini do the whole grounded search.
  let candidates = [];
  let gen;
  if (grounding === true) {
    gen = await geminiGenerate(extractPromptGrounded({ pin: p, locality, city, state }), { grounding: true, model });
  } else {
    candidates = await freeSearchCandidates({ pin: p, locality, city, state });
    if (!candidates.length) {
      return { pin: p, ok: false, grounded: false, counters: [], aiError: "no free search results", via: "free", filledAt: Date.now() };
    }
    gen = await geminiGenerate(extractPrompt({ pin: p, locality, city, state }, candidates), { grounding: false, model });
  }

  let counters = [];
  let via = grounding === true ? "grounded" : "free+ai";
  if (gen.ok) {
    const rows = parseJsonLoose(gen.text);
    counters = (Array.isArray(rows) ? rows : [])
      .map((r) => {
        const name = String(r?.courier || "").trim();
        if (!name) return null;
        const canon = canonicalCourier(name);
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
  }

  // Fallback: AI failed or returned nothing usable but we DO have search text.
  if (!counters.length && candidates.length) {
    counters = heuristicCounters(candidates);
    via = gen.ok ? "free+heuristic" : "free+heuristic(ai-down)";
  }

  // If the paid grounded path hit the billing wall, surface it (don't cache).
  if (grounding === true && !gen.ok) {
    return { pin: p, ok: false, grounded: false, counters: [], aiError: gen.error, aiStatus: gen.status || null, via, model: gen.model, filledAt: Date.now() };
  }

  const record = {
    pin: p,
    ok: true,
    grounded: !!gen?.grounded,
    via,
    counters,
    candidateCount: candidates.length,
    aiError: gen.ok ? null : gen.error || null,
    model: gen.model,
    filledAt: Date.now(),
  };
  const isDiagnostic = !!model; // model override = a probe; don't poison the cache
  if (!isDiagnostic) await kv(["SET", `${NEAR_PREFIX}${p}`, JSON.stringify(record), "EX", String(NEAR_TTL_S)]);
  return record;
}

// Prompt for the paid grounded path (Gemini does its own search).
function extractPromptGrounded({ pin, locality, city, state }) {
  const where = [locality, city, state].map((s) => String(s || "").trim()).filter(Boolean).join(", ");
  return [
    `Using Google Search, find real courier / parcel delivery BRANCHES or PICKUP`,
    `COUNTERS in or very close to PIN ${pin}${where ? ` (${where})` : ""}, India.`,
    `Return ONLY a JSON array (up to 6, nearest first), each:`,
    `{"courier":"","branch":"","address":"","phone":"","rating":null,"distanceNote":""}`,
    `Do not invent addresses or phones. If none, return [].`,
  ].join("\n");
}

/**
 * Combine the nearby-counter signal with our OWN Velocity per-area performance to
 * recommend a courier. Cache-only + synchronous data — safe inline.
 *
 * @param {string} pin
 * @param {string} state   destination state (already full-name, for best3)
 * @param {{best3?:Function}} [deps]  inject carrierEngine.best3 to avoid a cycle
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

  let suggested = null;
  let reason = "";
  let firstToCheck = nearby[0] || null;

  const nearbyAndGood = nearby.find((c) => bestNames.includes(c.courier.toLowerCase()));
  if (nearbyAndGood) {
    suggested = nearbyAndGood.courier;
    reason = `${nearbyAndGood.courier} has a counter right here (${nearbyAndGood.branch || nearbyAndGood.distanceNote || nearbyAndGood.address || "in-area"}) AND is a top performer for ${state || "this area"} in our data.`;
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

  return { suggested, reason, nearby, firstToCheck, via: rec?.via || null, hasData: !!rec };
}

export { KNOWN_COURIERS, canonicalCourier };
