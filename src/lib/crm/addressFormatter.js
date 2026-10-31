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

import { lookupPincodeAreas, lookupPostOfficesByName } from "./pincode";
import { generateReply } from "./gemini";
import { generateVertex, isConfigured as vertexConfigured } from "./vertexGemini";

// Flash-Lite: $0.10 / $0.40 per 1M in/out tokens. ~750 tokens per address ⇒
// ~₹0.01 each. Overridable, but keep it to a cheap model.
const MODEL = process.env.GEMINI_ADDRESS_MODEL || "gemini-2.5-flash-lite";
const CACHE_PREFIX = "addrfmt:v8:"; // v8: locality-level PIN cross-check (recover/correct a wrong pincode from the customer's own area names)
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

// --- Locality-level PIN cross-check -------------------------------------------
// The customer sometimes types a PIN that is VALID but belongs to a DIFFERENT
// place than the address they wrote (e.g. a Noida PIN 201301 on a Loni/Ghaziabad
// address, correct PIN 201102). The state-level check misses this. Here we look
// the customer's OWN locality words up in India Post and, when they clearly point
// to a different pincode, recover the correct one — exactly what a human does by
// cross-checking the area against the PIN. We only hit the network when the PIN
// is "suspicious", so clean orders stay fast and free.

// Generic descriptors that trail a real place name — stripped so the India Post
// NAME search gets the actual locality ("Chirodi Road" -> "Chirodi").
const TRAIL_DESC = /\s+(road|rd|marg|hospital|clinic|mandir|temple|masjid|church|school|college|chowk|circle|society|colony|complex|market|bazar|bazaar|bus\s*stand|stand|station|more|mod|city|nagar)$/i;

// Words that are never a useful India Post post-office NAME to search on their
// own (generic address scaffolding), so they don't pollute the candidate list.
const WORD_STOP = new Set([
  "near", "opposite", "behind", "nearby", "main", "house", "home", "road", "marg", "hospital",
  "clinic", "mandir", "temple", "masjid", "church", "gurudwara", "school", "college", "chowk",
  "circle", "society", "colony", "complex", "market", "bazar", "bazaar", "stand", "station", "city",
  "gali", "lane", "street", "block", "district", "tehsil", "village", "post", "office", "plot",
  "flat", "room", "floor", "scissors", "salon", "shop", "new", "old", "number", "ward", "sector",
]);

// Up to `max` distinctive locality candidates from the address (city first) to
// cross-check the pincode against the customer's own area/village/town words.
// Emits both a short phrase per segment AND its individual significant words, so
// a locality buried mid-line (e.g. "... Sikhrani Chirodi ...") is still looked up.
function localityCandidates(address, max = 6) {
  const a = address || {};
  const out = [];
  const seen = new Set();
  const add = (p) => {
    const phrase = String(p || "").trim();
    if (phrase.length < 3) return;
    const k = _norm(phrase);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(phrase);
  };
  const consider = (s) => {
    const t = String(s || "").replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
    if (!t) return;
    const phrase = t.replace(TRAIL_DESC, "").trim().split(" ").slice(0, 3).join(" ");
    if (phrase && !WORD_STOP.has(_norm(phrase))) add(phrase);
    for (const w of t.split(" ")) {
      if (w.length >= 4 && !WORD_STOP.has(w.toLowerCase())) add(w);
    }
  };
  consider(a.city);
  const segs = [a.line1, a.line2, a.line3]
    .filter(Boolean)
    .join(", ")
    .split(/[,\n/]|\bnear\b|\bopposite\b|\bbehind\b|\bnr\b/i);
  for (const s of segs) {
    if (out.length >= max) break;
    consider(s);
  }
  return out.slice(0, max);
}

// Does the given PIN's own district / any of its post-office areas appear in the
// address text? If yes, the PIN is consistent with the locality → not suspicious.
function pinLocalityMatches(pinInfo, address) {
  const a = address || {};
  const text = _norm([a.line1, a.line2, a.line3, a.city].filter(Boolean).join(" "));
  if (!text || !pinInfo) return false;
  const names = [pinInfo.city, ...(pinInfo.areas || [])].map(_norm).filter((n) => n.length >= 3);
  return names.some((n) => text.includes(n));
}

// Cross-check the given pincode against the customer's locality names. Returns
// { suspicious, hits:[{query,offices}], suggestedPincode, suggestedDistrict }.
// Network lookups happen ONLY when the pin is suspicious. Never throws.
async function crossCheckPin({ pin, pinInfo, address }) {
  const a = address || {};
  const out = { suspicious: false, likelyWrong: false, districtMismatch: false, hits: [], suggestedPincode: "", suggestedDistrict: "" };
  const pinOk = pin && pin.length === 6 && !!pinInfo?.state;
  const stateMismatch = pinOk && _norm(a.state) && _norm(pinInfo.state) && _norm(a.state) !== _norm(pinInfo.state);
  const localityMatch = pinOk && pinLocalityMatches(pinInfo, a);
  // "suspicious" only gates whether we spend the India Post lookups — it is NOT
  // enough on its own to flag the order (a sparse-but-valid address often just
  // doesn't spell its PO area). We flag only on real evidence (see likelyWrong).
  out.suspicious = !pinOk || stateMismatch || !localityMatch;
  if (!out.suspicious) return out;

  const stHint = clean(a.state) || clean(pinInfo?.state);
  const cityN = _norm(a.city);
  // district "matches" the customer's city when one name contains the other.
  const dm = (district) => {
    const d = _norm(district);
    return !!(cityN && d && (cityN.includes(d) || d.includes(cityN)));
  };
  // The given PIN resolves to a district that is NOT the customer's stated city
  // (reached only when the area-name check already failed) — a strong, verified
  // sign the PIN belongs elsewhere (the Noida-201301-vs-Ghaziabad case).
  out.districtMismatch = pinOk && !!cityN && !!_norm(pinInfo.city) && !dm(pinInfo.city);
  const cands = localityCandidates(a, 6);

  // Look each candidate up, keeping ONLY post offices in the order's state (an
  // out-of-state same-named PO is not the customer's locality — that pollution
  // is what wrongly matched "Chintamani" to Karnataka/Tamil Nadu). Collect:
  //  - districtPins: pins from NON-city locality words whose district == the city
  //    (these pin down the exact locality, e.g. Loni-in-Ghaziabad = 201102), and
  //  - cityPins: pins the city word itself resolves to (used only to recover an
  //    INVALID pin, e.g. Badlapur = 421503 — never to override a valid pin, since
  //    a big district's city word returns many generic PINs).
  const districtPins = new Map(); // pin -> district
  const cityPins = new Map();     // pin -> district
  for (const q of cands) {
    let offices = [];
    try { offices = await lookupPostOfficesByName(q, stHint); } catch { offices = []; }
    if (stHint) offices = offices.filter((o) => _norm(o.state) === _norm(stHint));
    if (!offices.length) continue;
    out.hits.push({ query: q, offices: offices.slice(0, 3) });
    const isCityTok = _norm(q) === cityN && cityN.length >= 3;
    for (const o of offices) {
      if (!o.pin || o.pin === pin) continue;
      if (isCityTok) cityPins.set(o.pin, o.district);
      else if (dm(o.district)) districtPins.set(o.pin, o.district);
    }
  }

  // Suggest only when UNAMBIGUOUS (never guess among conflicting pins):
  //  (a) exactly one locality pin sits in the customer's own city/district, or
  //  (b) the given pin is INVALID and the city word maps to exactly one pin.
  if (districtPins.size === 1) {
    const [p, d] = [...districtPins.entries()][0];
    out.suggestedPincode = p;
    out.suggestedDistrict = d;
  } else if (!pinOk && cityPins.size === 1) {
    const [p, d] = [...cityPins.entries()][0];
    out.suggestedPincode = p;
    out.suggestedDistrict = d;
  }

  // Flag the order ONLY on real evidence: an invalid PIN, a state/district clash,
  // or a verified alternative PIN. A valid PIN whose area simply isn't spelled in
  // the text (no clash, no better PIN found) is left alone — don't over-flag.
  out.likelyWrong = !pinOk || stateMismatch || out.districtMismatch || !!out.suggestedPincode;
  return out;
}

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

function buildPrompt({ name, phone, address, pinInfo, pinCheck }) {
  const a = address || {};
  const raw = [a.line1, a.line2, a.line3].map(clean).filter(Boolean).join("\n");
  const facts = pinInfo?.state
    ? `PIN ${a.postalCode}: district "${pinInfo.city}", state "${pinInfo.state}"` +
      (pinInfo.blocks && pinInfo.blocks.length ? `, administrative block "${pinInfo.blocks.join('" or "')}"` : "") +
      (pinInfo.division ? `, postal division "${pinInfo.division}"` : "") +
      `. Post-office localities on this PIN (real places you may reference): ${(pinInfo.areas || []).join(", ") || "(none)"}.`
    : `PIN ${a.postalCode || "(missing)"} did not resolve to India Post data.`;

  // PIN CROSS-CHECK block — only when the given PIN looks wrong for the locality.
  // Gives the model India-Post-verified pincodes for the customer's OWN area words
  // so it can correct a wrong PIN (rule 7b) WITHOUT inventing anything.
  let cross = "";
  if (pinCheck && pinCheck.likelyWrong) {
    // A verified, high-signal clue: the given PIN's own district vs the city the
    // customer wrote. When they differ, the PIN very likely belongs to a different
    // place (this is the Noida-201301-vs-Ghaziabad case).
    const districtNote =
      pinInfo?.state && clean(a.city) && _norm(pinInfo.city) && _norm(pinInfo.city) !== _norm(a.city) &&
      !_norm(a.city).includes(_norm(pinInfo.city)) && !_norm(pinInfo.city).includes(_norm(a.city))
        ? `\n  NOTE: the given PIN's district is "${pinInfo.city}", but the customer's stated city is "${a.city}" — these differ, a strong sign the PIN is wrong.`
        : "";
    const lines = (pinCheck.hits || []).map((h) => {
      const offs = (h.offices || []).map((o) => `${o.pin} (${o.district}, ${o.state})`).join("; ") || "(no match)";
      return `  - "${h.query}" -> ${offs}`;
    });
    cross =
      `\nPIN CROSS-CHECK: the given PIN's own district/localities do NOT clearly appear in this address, so the PIN may be WRONG.` +
      districtNote +
      `\n  India Post places the customer's own locality words as:\n` +
      (lines.length ? lines.join("\n") : "  (no post-office matches found)") +
      (pinCheck.suggestedPincode
        ? `\n  Verified correction for this locality: ${pinCheck.suggestedPincode}${pinCheck.suggestedDistrict ? ` (${pinCheck.suggestedDistrict})` : ""}.`
        : "") +
      `\nApply rule 7b.`;
  }

  return (
    `Customer: ${clean(name) || "(no name)"}  Phone: ${clean(phone) || "(none)"}\n` +
    `Raw address:\n${raw || "(empty)"}\n` +
    `City given: ${clean(a.city) || "(none)"}  State given: ${clean(a.state) || "(none)"}\n` +
    `Verified PIN facts: ${facts}` +
    cross
  );
}

const SYSTEM_PROMPT =
  "You are an expert Indian courier shipping-address specialist. You get a customer's raw address plus VERIFIED India Post facts for its PIN (you have NO web search — use only the given facts and the input; never claim to have searched online). Turn it into a clean, properly ARRANGED, courier-ready address that minimises failed delivery/RTO. " +
  "Enhance it the way a careful human would when cleaning an address for a courier: fix and arrange everything, and ADD the real administrative structure (village/block/district/state) you can derive from the VERIFIED India Post facts — so a sparse one-line address becomes a clear, well-structured multi-line one. " +
  "ALWAYS REARRANGE into this multi-line delivery sequence, each component on ITS OWN line (drop lines that don't apply — never pad): " +
  "recipient name; house/flat/building no. + building name; floor/building-block/street; locality/colony; 'Near|Opposite|Behind <landmark>'; village/town; 'Block <block>, District <district>' (add this line using the VERIFIED block + district from the facts when available — these are REAL India Post administrative units, NOT inventions; if the customer wrote their own nearby town/tehsil keep that too); the state and PIN together on their own line written as '<State Name> – <6-digit PIN>' (e.g. 'Bihar – 853202'; use the REAL state name, NEVER the literal word 'State', and an en-dash before the PIN); 'India'; 'Mobile: <10-digit number>' (strip any leading +91 or 91 country code). The PIN appears ONCE only (on the State line), NEVER repeat it. " +
  "RULES: " +
  "(1) FIX spelling, capitalization, punctuation and obvious typos; expand clear abbreviations ('Bas stand'->'Bus Stand', 'ke pass/pas/pass'->'Near', 'oppo'->'Opposite', 'St'->'Street', 'rd'->'Road', 'nr'->'Near'). Do NOT change unfamiliar local names you can't confidently correct. " +
  "(2) LANDMARK PLACEMENT: keep the customer's own relation word EXACTLY — never turn 'Opposite'/'Behind' into 'Near'. If they wrote a bare landmark that is clearly the delivery reference (e.g. 'Bus Stand', 'XYZ Hospital') you MAY prefix 'Near' to arrange it. " +
  "(3) PRESERVE every customer detail — recipient name, house/flat/building no., village, town, district/tehsil, street, landmark, phone — EXACTLY. NEVER invent a house number, building, street, landmark or recipient detail. Do NOT change the PIN on your own guess; the ONLY time you may change it is when a 'PIN CROSS-CHECK' section supplies a verified correct PIN for the customer's own locality (see rule 7b). " +
  "(4) KEEP any landmark the customer gave (temple/mandir, masjid, church, school, shop, hospital, chowk, bus stand, etc.) — never delete it or swap it for a post-office name. ONLY when the customer gave NO usable landmark AND the street is thin, you MAY add ONE nearest VERIFIED post-office area from the given facts as 'Near <Area>'. Never invent a landmark not in the input or the facts. " +
  "(5) Remove ACCIDENTAL repetition (same landmark/locality written twice), but keep two genuinely different components. " +
  "(6) Standardize city/state to the verified PIN facts when they clearly differ; if the customer's 'city' is really a locality, keep it as the locality line and use the PIN's district as the city/district. " +
  "(6b) ADMINISTRATIVE ENRICHMENT (this is what makes the output good, like a hand-cleaned address): you MAY and SHOULD add, taken ONLY from the verified facts, the administrative Block ('Block <X>'), the District, and the country line 'India'. These are real units from India Post, so adding them is NOT inventing. If the facts give no block, simply omit the Block line — never guess one. Do the same spelling/arrangement care on village/town names. " +
  "(7) VERDICT: 'SHIP' when the address is complete and consistent and a courier can reasonably reach it.'CONFIRM' when it is usable but a MATERIAL uncertainty remains — the PIN clashes with the locality, the exact delivery point is ambiguous (e.g. only a common hospital/landmark name with no house/street, or two places could share that name), a needed detail is missing, OR part of the input is garbled/unintelligible (not a real place/street/landmark) so you cannot confidently place the delivery point. KEEP any garbled text in the address (never drop it) and set CONFIRM. Don't over-flag: a real village/locality/landmark with a valid PIN is usually SHIP even without a house number. In 'reason', say in one short Hinglish line what was fixed or what to confirm. " +
  "(7b) PIN CORRECTION (only when a 'PIN CROSS-CHECK' section is present): the given PIN may be wrong for this locality — your job is to SUGGEST the correct one, like a careful human cross-checking the area against the PIN. Priority: (i) if the cross-check gives a single 'Verified correction', USE that PIN. (ii) Else, if the cross-check's district NOTE or the locality lines clearly show the customer's area belongs to a different, WELL-KNOWN pincode that you are confident about, you MAY put that corrected PIN (prefer one shown in the cross-check; only use your own knowledge for a clearly well-known town/locality, never a guess for an obscure village). Either way SET VERDICT CONFIRM and in 'reason' name the change in Hinglish and ask to verify, e.g. 'PIN 201301 Noida ka hai par address Ghaziabad/Loni ka — sahi PIN ~201102 lagta hai, customer se confirm karein.' (iii) If you cannot determine a confident correct PIN, KEEP the given PIN but still SET CONFIRM with reason 'PIN area se match nahi kar raha — customer se sahi PIN confirm karein.' NEVER invent a random PIN for an unknown place; when unsure, flag CONFIRM instead of guessing. A corrected PIN is only ever a SUGGESTION to confirm — it never ships without a human check. " +
  "OUTPUT FORMAT — return ONLY the formatted address, ONE component per line, then two marker lines. NO JSON, NO code fence, NO extra words:\n" +
  "<address line 1>\n<address line 2>\n…(as many lines as needed)…\n" +
  "@@VERDICT: SHIP   (or CONFIRM)\n" +
  "@@REASON: <one short Hinglish sentence of what you fixed / what to confirm>";

// Legacy JSON parse — kept as a fallback in case the model emits JSON anyway.
function parseJsonShape(t) {
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const j = JSON.parse(t.slice(start, end + 1));
    if (j && Array.isArray(j.formatted)) return j;
  } catch {
    /* fall through to line parser */
  }
  return null;
}

// Parse the model's reply. Primary format is plain lines + '@@VERDICT:' /
// '@@REASON:' markers (robust — no brittle JSON array that a single stray quote
// can break, which was silently forcing the deterministic fallback). Still
// accepts a JSON object if the model emits one.
function parseModelJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  // Strip an accidental ``` fence.
  const fence = t.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();

  // JSON first, if it looks like JSON and actually parses.
  if (t.startsWith("{")) {
    const j = parseJsonShape(t);
    if (j) {
      return {
        formatted: j.formatted,
        verdict: j.verdict,
        locality: j.locality,
        landmark: j.landmark,
        limitation: j.limitation,
        reason: j.reason,
      };
    }
  }

  // Line format.
  const formatted = [];
  let verdict = "SHIP";
  let reason = "";
  let seenMarker = false;
  for (const rawLn of t.split(/\r?\n/)) {
    const ln = rawLn.trim();
    const mv = ln.match(/^@@?\s*VERDICT\s*[:\-]\s*(SHIP|CONFIRM)\b/i);
    if (mv) {
      verdict = mv[1].toUpperCase();
      seenMarker = true;
      continue;
    }
    const mr = ln.match(/^@@?\s*REASON\s*[:\-]\s*(.*)$/i);
    if (mr) {
      reason = mr[1].trim();
      seenMarker = true;
      continue;
    }
    if (seenMarker || !ln) continue; // address lines are only before the markers
    formatted.push(ln.replace(/^[-*•]\s*/, "")); // drop an accidental bullet
  }
  if (!formatted.length) return null;
  return { formatted, verdict, reason, locality: "", landmark: "", limitation: "" };
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

  // 2b) Locality-level PIN cross-check (network only when the PIN looks wrong for
  //     the locality). Recovers the correct pincode from the customer's own area
  //     names so the model can CORRECT a wrong PIN (rule 7b) instead of shipping it.
  let pinCheck = { suspicious: false, hits: [], suggestedPincode: "", suggestedDistrict: "" };
  try {
    pinCheck = await crossCheckPin({ pin, pinInfo, address: a });
  } catch {
    /* best-effort — a cross-check failure never blocks formatting */
  }
  const pinMeta = {
    suggestedPincode: pinCheck.suggestedPincode,
    suggestedDistrict: pinCheck.suggestedDistrict,
    pinCheck: {
      suspicious: pinCheck.suspicious,
      likelyWrong: pinCheck.likelyWrong,
      districtMismatch: pinCheck.districtMismatch,
      suggestedPincode: pinCheck.suggestedPincode,
      suggestedDistrict: pinCheck.suggestedDistrict,
    },
  };

  let result;

  // 3) Fast path: deterministic, ONLY when no AI is configured. When AI is
  //    available we ALWAYS let it arrange (the deterministic pass doesn't
  //    rearrange lines or fix landmark wording like 'Bas stand' -> 'Near Bus
  //    Stand'), so output matches a hand-cleaned address. Deterministic stays as
  //    the safe fallback in the else branch if the model fails.
  const aiOn = vertexConfigured() || !!process.env.GEMINI_API_KEY;
  if (isAlreadyClean(a, pinInfo) && !aiOn) {
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
      ...pinMeta,
      cost: 0,
    };
  } else {
    // 4) Model path. Try the cheap Flash-Lite first; if that model/call fails,
    //    fall back to the default model (whatever autoReply uses) so a wrong
    //    model id can never silently disable the formatter.
    const prompt = buildPrompt({ name, phone, address: a, pinInfo, pinCheck });
    const opts = { systemPrompt: SYSTEM_PROMPT, temperature: 0, maxOutputTokens: 512 };
    // Prefer Vertex AI (service-account on a GCP project with working billing)
    // when it's configured; otherwise the AI Studio API key. Each tries the cheap
    // flash-lite first, then the default model.
    const gen = vertexConfigured() ? generateVertex : generateReply;
    let ai = await gen(prompt, { ...opts, model: MODEL });
    if (!ai.ok) ai = await gen(prompt, opts); // default model fallback
    const parsed = ai.ok ? parseModelJson(ai.text) : null;
    if (!parsed) {
      console.warn("[addressFormatter] AI unusable:", JSON.stringify(ai.error || ai.text || "").slice(0, 200));
    }
    const aiErr = ai.ok ? "" : ` [${JSON.stringify(ai.error).slice(0, 120)}]`;
    if (parsed && Array.isArray(parsed.formatted) && parsed.formatted.length) {
      const formatted = parsed.formatted.map(clean).filter(Boolean);
      const verdict = parsed.verdict === "CONFIRM" ? "CONFIRM" : "SHIP";
      // If the model CORRECTED the PIN (rule 7b) its new PIN is on the State line.
      // Capture it as the suggestion (so the Call Queue shows it), preferring the
      // India-Post-verified value. Only when the model flagged CONFIRM — never let
      // a rewritten PIN look authoritative on a SHIP.
      const modelPin =
        verdict === "CONFIRM" ? (formatted.join(" ").match(/\b[1-9]\d{5}\b/g) || []).find((x) => x !== pin) || "" : "";
      const suggestedPincode = pinMeta.suggestedPincode || modelPin;
      result = {
        formatted,
        text: formatted.join("\n"),
        verdict,
        locality: clean(parsed.locality) || clean(pinInfo.city) || clean(a.city),
        landmark: clean(parsed.landmark),
        limitation: clean(parsed.limitation),
        reason: clean(parsed.reason),
        source: "ai",
        pin,
        ...pinMeta,
        suggestedPincode,
        pinCheck: { ...pinMeta.pinCheck, suggestedPincode: suggestedPincode || pinMeta.pinCheck.suggestedPincode },
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
        limitation: (ai.ok ? "AI output unreadable — showing arranged address." : "AI unavailable — showing arranged address.") + aiErr,
        reason: "",
        source: "deterministic",
        pin,
        ...pinMeta,
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
