// Google-Search–grounded address research — the "pure fixer" deep step.
//
// Only for GENUINELY STUCK addresses (wrong/unverifiable PIN, flagged CONFIRM
// with no usable landmark): Gemini is given the Google Search tool so it can look
// up the real locality, correct the PIN, and find ONE real navigation landmark —
// exactly like a human researching the address on the web.
//
// BUDGET-SAFE BY DESIGN (keeps the ₹15-20/month ceiling):
//   • Flag-gated: does nothing unless GROUNDING_ENABLED=1.
//   • Prefers the FREE AI Studio key (grounding runs on its free tier ⇒ ~₹0).
//   • Vertex (paid, ~₹2.9/grounded call) is used ONLY if GROUNDING_ALLOW_VERTEX=1.
//   • Monthly HARD CAP (GROUNDING_MONTHLY_CAP, default 40) counted in KV — once
//     hit, grounding stops for the month no matter what.
//   • One grounded call per order ever (the formatter caches the whole result).
// Never throws: any failure returns { ok:false } and the caller keeps its
// non-grounded result, so shipping is never blocked.

function env() {
  return {
    enabled: process.env.GROUNDING_ENABLED === "1",
    allowVertex: process.env.GROUNDING_ALLOW_VERTEX === "1",
    cap: Number(process.env.GROUNDING_MONTHLY_CAP) || 40,
    model: process.env.GROUNDING_MODEL || "gemini-2.5-flash",
    aiKey: (process.env.GEMINI_API_KEY || "").trim(),
  };
}

const groundingEnabled = () => env().enabled;

// --- KV (same REST shape as addressFormatter) --------------------------------
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
    if (!res.ok) return null;
    return (await res.json())?.result ?? null;
  } catch {
    return null;
  }
}

function monthKey() {
  const d = new Date();
  return `grounding:count:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
async function monthCount() {
  const v = await kv(["GET", monthKey()]);
  return Number(v) || 0;
}
async function bumpMonth() {
  const k = monthKey();
  const n = await kv(["INCR", k]);
  if (Number(n) === 1) await kv(["EXPIRE", k, String(40 * 24 * 60 * 60)]); // auto-expire after the month
  return Number(n) || 0;
}

const SYSTEM = `You are an Indian postal-address verification researcher. Use Google Search to verify and, where clearly wrong, correct a delivery address. Rules:
- Check the 6-digit PIN against the stated locality/city/district. If the PIN clearly does NOT belong to that locality, find the correct PIN for the customer's own locality.
- Identify the correct DISTRICT and a verified LOCALITY/area name; fix obvious phonetic or spelling errors using REAL place names only.
- Find ONE real, well-known nearby NAVIGATION landmark (post office, chowk, main road, prominent temple/school/market/ATM) that genuinely exists near this locality. Never invent one.
- NEVER invent house/flat/plot numbers, street names, or customer confirmations.
- If you cannot verify confidently, keep values as given/NONE and set CONFIDENCE LOW.
Return ONLY these labeled lines, nothing else, no markdown:
CORRECTED_PIN: <6 digits, or NONE if the given PIN is fine or unverifiable>
DISTRICT: <district, or NONE>
LOCALITY: <verified locality/area, or NONE>
LANDMARK: <one real landmark, or NONE>
CONFIDENCE: <HIGH|MEDIUM|LOW>
NOTE: <one short line explaining what you verified or corrected>`;

function buildQuery({ name, address, pin, pinInfo }) {
  const a = address || {};
  const lines = [a.line1, a.line2, a.line3, a.city, a.state].map((x) => String(x || "").trim()).filter(Boolean);
  const parts = [
    `Address: ${lines.join(", ") || a.raw || ""}`,
    `Stated PIN: ${pin || "unknown"}`,
  ];
  if (pinInfo?.city || pinInfo?.state) parts.push(`India Post says PIN ${pin} = ${pinInfo.city || "?"}, ${pinInfo.state || "?"}`);
  parts.push("Verify the PIN/locality/district and find one real nearby landmark. Research on Google.");
  return parts.join("\n");
}

function pick(raw, label) {
  const m = new RegExp(`^${label}\\s*:\\s*(.+)$`, "im").exec(raw || "");
  const v = m ? m[1].trim() : "";
  return /^(none|n\/?a|unknown|-)$/i.test(v) ? "" : v;
}

function parse(raw) {
  const correctedPin = (pick(raw, "CORRECTED_PIN").match(/\b[1-9]\d{5}\b/) || [""])[0];
  const confidenceRaw = pick(raw, "CONFIDENCE").toUpperCase();
  return {
    correctedPin,
    district: pick(raw, "DISTRICT"),
    locality: pick(raw, "LOCALITY"),
    landmark: pick(raw, "LANDMARK"),
    confidence: /HIGH|MEDIUM|LOW/.test(confidenceRaw) ? confidenceRaw.match(/HIGH|MEDIUM|LOW/)[0] : "LOW",
    note: pick(raw, "NOTE"),
  };
}

// --- Provider calls (with the Google Search tool) ----------------------------
async function callAIStudio({ model, aiKey, query }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    contents: [{ role: "user", parts: [{ text: query }] }],
    system_instruction: { parts: [{ text: SYSTEM }] },
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0, maxOutputTokens: 1024 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": aiKey },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("").trim();
  return text ? { ok: true, text } : { ok: false, error: "empty response" };
}

async function callVertex({ model, query }) {
  // Reuse vertexGemini's SA auth + token caching; it now forwards opts.tools so
  // we can attach the Google Search tool for a grounded (paid) call.
  const mod = await import("./vertexGemini.js").catch(() => null);
  if (!mod?.generateVertex) return { ok: false, error: "vertex module unavailable" };
  return mod.generateVertex(query, {
    model,
    systemPrompt: SYSTEM,
    temperature: 0,
    maxOutputTokens: 1024,
    tools: [{ googleSearch: {} }],
  });
}

/**
 * Deep-research a stuck address with Google Search grounding.
 * @returns {Promise<{ok:boolean, correctedPin?:string, district?:string,
 *   locality?:string, landmark?:string, confidence?:string, note?:string,
 *   provider?:string, capped?:boolean, error?:any}>}
 */
async function groundAddress({ name, address, pin, pinInfo } = {}) {
  const e = env();
  if (!e.enabled) return { ok: false, error: "grounding disabled" };

  // Monthly hard cap — the real budget guarantee.
  const used = await monthCount();
  if (used >= e.cap) return { ok: false, capped: true, error: `monthly cap ${e.cap} reached (${used})` };

  const query = buildQuery({ name, address, pin, pinInfo });

  let r = { ok: false, error: "no provider" };
  let provider = "";
  if (e.aiKey) {
    r = await callAIStudio({ model: e.model, aiKey: e.aiKey, query });
    if (r.ok) provider = "ai-studio";
  }
  if (!r.ok && e.allowVertex) {
    r = await callVertex({ model: e.model, query });
    if (r.ok) provider = "vertex";
  }
  if (!r.ok) return { ok: false, error: r.error };

  // Count only successful (billable) grounded calls.
  await bumpMonth();

  const parsed = parse(r.text);
  return { ok: true, provider, raw: r.text, ...parsed };
}

export { groundAddress, groundingEnabled, monthCount };
