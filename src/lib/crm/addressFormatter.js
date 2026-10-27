// AI address formatter — turns a messy customer address into a clean,
// courier-ready one, exactly like pasting it into ChatGPT, but automatically and
// for ~1 paisa per address.
//
// Pipeline:
//   1. Verify the PIN against India Post (pincode.js) → real district, state and
//      the post-office area names (the ONLY landmarks we're allowed to add).
//   2. If the address is already clean + the PIN resolves + the state matches,
//      SKIP the model and format deterministically (zero cost).
//   3. Otherwise ask Gemini FLASH-LITE (5× cheaper than Flash) to fix spelling,
//      arrange the lines, add a real post-office landmark when it helps, and
//      return a verdict: SHIP or CONFIRM — never inventing anything.
//   4. Cache the result per order in KV, so each order costs at most ONE call,
//      ever (re-opening / re-shipping reads the cache).
//
// Never throws: on any failure it falls back to a deterministic format of the
// address as-is with a neutral verdict, so shipping is never blocked.

import { lookupPincodeAreas } from "./pincode";
import { generateReply } from "./gemini";

// Flash-Lite: $0.10 / $0.40 per 1M in/out tokens. ~750 tokens per address ⇒
// ~₹0.01 each. Overridable, but keep it to a cheap model.
const MODEL = process.env.GEMINI_ADDRESS_MODEL || "gemini-2.5-flash-lite";
const CACHE_PREFIX = "addrfmt:v1:";
const CACHE_TTL_S = 90 * 24 * 60 * 60; // 90 days

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

const _alnum = (s) => String(s || "").replace(/[^a-z0-9]/gi, "").length;
const _norm = (s) => String(s || "").trim().toLowerCase();
const clean = (s) => String(s || "").trim();

// A short, stable fingerprint of the address input, so a later EDIT re-formats
// (cache miss) but an unchanged order is served from cache.
function fingerprint(a, name, phone) {
  const s = [name, phone, a.line1, a.line2, a.line3, a.city, a.state, a.postalCode]
    .map((x) => _norm(x))
    .join("|");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Deterministic courier-ready lines, used both for the no-AI fast path and as a
// safe fallback. Never invents — only arranges what's there plus verified city/
// state/pin.
function deterministicFormat({ name, phone, address, pinInfo }) {
  const a = address || {};
  const streetBits = [a.line1, a.line2, a.line3].map(clean).filter(Boolean);
  const city = clean(a.city) || clean(pinInfo?.city);
  const state = clean(a.state) || clean(pinInfo?.state);
  const pin = clean(a.postalCode).replace(/\D/g, "");
  const lines = [];
  if (clean(name)) lines.push(clean(name));
  lines.push(...streetBits);
  const cityState = [city, state].filter(Boolean).join(", ");
  if (cityState) lines.push(pin ? `${cityState} - ${pin}` : cityState);
  else if (pin) lines.push(`PIN ${pin}`);
  if (clean(phone)) lines.push(`Mobile: ${clean(phone).replace(/^(\+?91)/, "")}`);
  return lines;
}

// Is the address good enough to skip the model? Clean = resolvable PIN, a real
// street (not just a door number), state already matching, and no obvious mess
// (a phone number crammed into the street, or everything jammed on one line).
function isAlreadyClean(address, pinInfo) {
  const a = address || {};
  if (!pinInfo?.state) return false; // PIN didn't resolve → let the model look
  const street = [a.line1, a.line2, a.line3].map(clean).filter(Boolean).join(" ");
  if (_alnum(street) < 15) return false; // thin → model may add a locality
  if (_norm(a.state) !== _norm(pinInfo.state)) return false; // wrong state → fix
  if (/\b[6-9]\d{9}\b/.test(street)) return false; // phone jammed into address
  if ((a.line1 || "").length > 70 && !clean(a.line2)) return false; // all on one line
  return true;
}

function buildPrompt({ name, phone, address, pinInfo }) {
  const a = address || {};
  const raw = [a.line1, a.line2, a.line3].map(clean).filter(Boolean).join("\n");
  const facts = pinInfo?.state
    ? `PIN ${a.postalCode}: district "${pinInfo.city}", state "${pinInfo.state}". ` +
      `Post-office areas on this PIN (the ONLY landmarks you may reference): ${(pinInfo.areas || []).join(", ") || "(none)"}.`
    : `PIN ${a.postalCode || "(missing)"} did not resolve to India Post data.`;
  return (
    `Customer: ${clean(name) || "(no name)"}  Phone: ${clean(phone) || "(none)"}\n` +
    `Raw address:\n${raw || "(empty)"}\n` +
    `City given: ${clean(a.city) || "(none)"}  State given: ${clean(a.state) || "(none)"}\n` +
    `Verified PIN facts: ${facts}`
  );
}

const SYSTEM_PROMPT =
  "You are an expert Indian courier-address checker. You are given a customer's raw address and VERIFIED India Post facts for its PIN code. " +
  "Produce a clean, courier-ready address. RULES: " +
  "(1) Fix spelling and capitalization and arrange into clear lines: name, house/street, landmark, area & district, 'State - PIN', 'Mobile: <number>'. " +
  "(2) You MAY add ONE landmark ONLY from the listed post-office areas (e.g. 'Near <Area> Post Office'); NEVER invent a landmark, road, or building that is not in the input or the verified facts. " +
  "(3) Standardize city/state to the verified PIN facts if they differ. " +
  "(4) Verdict is 'SHIP' if the address is deliverable (a courier could reasonably reach it using the street + PIN). Verdict is 'CONFIRM' only if it is genuinely too vague/incomplete to deliver even with the PIN, or the PIN clearly mismatches the area. Do not over-flag — a landmark/area with a valid PIN is usually SHIP. " +
  "Respond with ONLY a compact JSON object, no markdown, no code fence: " +
  '{"formatted":["line1","line2",...],"verdict":"SHIP|CONFIRM","locality":"","landmark":"","limitation":"","reason":"one short Hinglish sentence"}';

function parseModelJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  // Strip an accidental ```json fence.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Format one order's address. Cached per order+fingerprint.
 * @param {{orderId?:string, name?:string, phone?:string, address:object, force?:boolean}} input
 * @returns {Promise<{formatted:string[], text:string, verdict:"SHIP"|"CONFIRM"|"UNKNOWN",
 *   locality?:string, landmark?:string, limitation?:string, reason?:string,
 *   source:"cache"|"ai"|"deterministic", pin:string, cost:number}>}
 */
export async function formatAddress({ orderId, name, phone, address, force } = {}) {
  const a = address || {};
  const pin = clean(a.postalCode).replace(/\D/g, "");
  const fp = fingerprint(a, name, phone);
  const cacheKey = orderId ? `${CACHE_PREFIX}${orderId}:${fp}` : "";

  // 1) Cache.
  if (cacheKey && !force) {
    const cached = await kv(["GET", cacheKey]);
    if (cached) {
      try {
        const v = typeof cached === "string" ? JSON.parse(cached) : cached;
        if (v?.formatted) return { ...v, source: "cache", cost: 0 };
      } catch {
        /* fall through */
      }
    }
  }

  // 2) Verified PIN facts.
  let pinInfo = { city: "", state: "", areas: [] };
  try {
    if (pin.length === 6) pinInfo = await lookupPincodeAreas(pin);
  } catch {
    /* unresolved — the model/fallback handle it */
  }

  let result;

  // 3) Fast path: already clean → no model call, zero cost.
  if (isAlreadyClean(a, pinInfo)) {
    const formatted = deterministicFormat({ name, phone, address: a, pinInfo });
    result = {
      formatted,
      text: formatted.join("\n"),
      verdict: "SHIP",
      locality: pinInfo.city || clean(a.city),
      landmark: "",
      limitation: "",
      reason: "Address already complete — PIN verified.",
      source: "deterministic",
      pin,
      cost: 0,
    };
  } else {
    // 4) Model path (Flash-Lite, tiny output).
    const ai = await generateReply(buildPrompt({ name, phone, address: a, pinInfo }), {
      systemPrompt: SYSTEM_PROMPT,
      model: MODEL,
      temperature: 0.2,
      maxOutputTokens: 350,
    });
    const parsed = ai.ok ? parseModelJson(ai.text) : null;
    if (parsed && Array.isArray(parsed.formatted) && parsed.formatted.length) {
      const formatted = parsed.formatted.map(clean).filter(Boolean);
      result = {
        formatted,
        text: formatted.join("\n"),
        verdict: parsed.verdict === "CONFIRM" ? "CONFIRM" : "SHIP",
        locality: clean(parsed.locality),
        landmark: clean(parsed.landmark),
        limitation: clean(parsed.limitation),
        reason: clean(parsed.reason),
        source: "ai",
        pin,
        cost: 1, // ~1 model call
      };
    } else {
      // Fallback: deterministic format, neutral verdict (never block shipping).
      const formatted = deterministicFormat({ name, phone, address: a, pinInfo });
      result = {
        formatted,
        text: formatted.join("\n"),
        verdict: pinInfo.state ? "SHIP" : "UNKNOWN",
        locality: pinInfo.city || clean(a.city),
        landmark: "",
        limitation: ai.ok ? "AI output unreadable — showing arranged address." : "AI unavailable — showing arranged address.",
        reason: "",
        source: "deterministic",
        pin,
        cost: 0,
      };
    }
  }

  // 5) Cache (best-effort), minus the per-call fields.
  if (cacheKey) {
    const { source, cost, ...toCache } = result;
    await kv(["SET", cacheKey, JSON.stringify(toCache), "EX", String(CACHE_TTL_S)]);
  }
  return result;
}

export { MODEL as ADDRESS_MODEL };
