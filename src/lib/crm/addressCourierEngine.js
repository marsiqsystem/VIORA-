// ADDRESS INTELLIGENCE + COURIER SELECTION ENGINE (spec 2026-11-09).
// See [[viora-address-courier-engine-spec-2026-11-09]] for the full contract.
//
// Takes a raw customer address and produces the structured report the spec's
// MODULE C defines: BEFORE/AFTER, address verification + 0-100 confidence,
// landmark notes, a 5-courier comparison (ONLY DTDC / Delhivery / Blue Dart /
// XpressBees / Ekart), a best-courier pick, a dispatch verdict (SHIP /
// SHIP AFTER CONFIRMATION / HOLD) and a short customer message.
//
// It orchestrates the pieces we already have and NEVER fabricates data:
//   - Module A  : addressPipeline.reviewOrderAddress (AI/OSM clean + PIN verify)
//                 + pincode.lookupPincodeAreas (India Post) + a confidence score.
//   - Module B  : carrierEngine (our real per-state RTO / fake-attempt history =
//                 the NDR/RTO signal) + courierProximity (nearby facilities, free
//                 OSM / optional Google CSE). Live PIN serviceability + last-mile
//                 are marked UNKNOWN until a courier serviceability API / Velocity
//                 is wired — per the spec we never invent a serviceable result.
//
// KPI = first-attempt delivery / low RTO, NOT nearest office.

import { reviewOrderAddress } from "./addressPipeline";
import { lookupPincodeAreas } from "./pincode";
import { fullState, stateRTO, best3, fakeRatePct } from "./carrierEngine";
import { suggestNearestCourier } from "./courierProximity";

// The ONLY five providers the spec allows, with display names.
export const APPROVED_COURIERS = ["DTDC", "Delhivery", "Bluedart", "XpressBees", "Ekart"];
const DISPLAY = { DTDC: "DTDC", Delhivery: "Delhivery", Bluedart: "Blue Dart", XpressBees: "XpressBees", Ekart: "Ekart" };

const digits = (s) => String(s || "").replace(/\D/g, "");
const has = (s) => !!String(s || "").trim();

// Does a line carry an explicit house/flat/plot number? (spec: never invent one)
function hasHouseNumber(text) {
  const t = String(text || "");
  return /(?:^|[\s,])(?:h\.?\s*no\.?|house\s*no\.?|flat\s*no\.?|plot\s*no\.?|door\s*no\.?|#)\s*[-:]?\s*\w+/i.test(t)
    || /(?:^|[\s,])\d{1,4}[a-z]?(?:[/-]\d{1,4}[a-z]?)?(?:,|\s|$)/i.test(t);
}
function hasRoad(text) {
  return /\b(road|rd\.?|marg|street|st\.?|lane|gali|cross|main|nagar|colony|sector|chowk|path|highway|nh[- ]?\d+)\b/i.test(String(text || ""));
}
function hasLandmark(text) {
  return /\b(near|opp\.?|opposite|behind|beside|next to|above|below|front of)\b/i.test(String(text || ""));
}

/**
 * Address confidence 0-100 (spec rubric). A critical PIN mismatch overrides a high
 * numeric score (returned via `pinConflict` so the verdict can force HOLD).
 */
function scoreAddress({ pinValid, stateMatch, cityKnown, lineText, pinConflict }) {
  let pinPts = pinValid ? (stateMatch ? 25 : 10) : 0; // PIN & postal consistency (25)
  const localityPts = cityKnown ? 20 : (has(lineText) ? 10 : 0); // locality/district (20)
  const roadPts = hasRoad(lineText) ? 15 : (has(lineText) ? 6 : 0); // road/street (15)
  const landmarkPts = hasLandmark(lineText) ? 20 : 0; // landmark (20)
  const housePts = hasHouseNumber(lineText) ? 20 : 0; // house/building precision (20)
  let total = pinPts + localityPts + roadPts + landmarkPts + housePts;
  if (pinConflict) total = Math.min(total, 49); // critical mismatch caps the score
  return { total, breakdown: { pin: pinPts, locality: localityPts, road: roadPts, landmark: landmarkPts, house: housePts } };
}

// Rank + describe the 5 approved couriers for this destination from the signals we
// actually have (per-state history + facility proximity). Everything unknown is
// labelled UNKNOWN — never guessed.
function buildCourierTable(state, nearbyCounters) {
  const ranked = best3(state) || [];                 // our per-state best performers
  const rankIndex = new Map(ranked.map((b, i) => [String(b.carrier || "").toLowerCase(), i]));
  const nearbyByCourier = new Map();
  for (const c of nearbyCounters || []) {
    const k = String(c.courier || "").toLowerCase();
    if (!nearbyByCourier.has(k)) nearbyByCourier.set(k, c);
  }

  const rows = APPROVED_COURIERS.map((courier) => {
    const key = courier.toLowerCase();
    const counter = nearbyByCourier.get(key) || null;
    const rank = rankIndex.has(key) ? rankIndex.get(key) + 1 : null; // 1..n or null
    const fake = fakeRatePct(courier);
    // Last-mile / RTO signal from OUR history (the only verified performance data).
    let lastMile = "UNKNOWN";
    if (rank === 1) lastMile = "Strong — #1 performer here (our data)";
    else if (rank) lastMile = `Good — top-${ranked.length} here (our data)`;
    else if (fake >= 20) lastMile = `Weak — ${fake}% fake-attempt RTO (our data)`;
    // A composite, honest score: proximity (have/UNKNOWN) + our RTO history. We do
    // NOT award points for serviceability/last-mile we can't verify.
    let score = 0;
    if (counter) score += 20;                         // nearby facility present
    if (rank === 1) score += 25; else if (rank === 2) score += 18; else if (rank === 3) score += 12;
    if (fake >= 25) score -= 10;                       // heavy faker penalty
    return {
      courier: DISPLAY[courier],
      nearestFacility: counter ? (counter.branch || counter.address || "in-area listing") : "UNKNOWN",
      facilityType: counter ? "Booking counter / listing (type unverified)" : "UNKNOWN",
      distance: counter ? (counter.distanceNote || "in-area") : "UNKNOWN",
      pinServiceability: "UNKNOWN — verify in Velocity",
      lastMile,
      ourRtoHistory: rank ? `rank #${rank} of ${ranked.length} for ${state || "area"}` : (fake ? `${fake}% fake RTO` : "no history"),
      score,
    };
  });
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

/**
 * Run the full engine on a raw address.
 * @param {{name?:string, phone?:string, line1?:string, line2?:string, line3?:string,
 *          city?:string, state?:string, pincode?:string, paymentMode?:string, orderId?:string}} input
 * @returns {Promise<object>} the structured MODULE C report.
 */
export async function analyzeAddressCourier(input = {}) {
  const pin = digits(input.pincode).slice(0, 6);
  const order = {
    orderId: input.orderId || "",
    name: input.name || "",
    phone: input.phone || "",
    paymentMode: input.paymentMode || "COD",
    address: {
      line1: input.line1 || "",
      line2: input.line2 || "",
      line3: input.line3 || "",
      city: input.city || "",
      state: input.state || "",
      postalCode: pin,
      country: "IN",
    },
  };

  // ---- MODULE A: address intelligence -------------------------------------
  let review = null;
  try { review = await reviewOrderAddress(order, { force: true }); } catch (e) { review = { route: "call", verdict: "UNKNOWN", problems: ["engine-error:" + (e?.message || e)] }; }

  // India Post PIN verification (authoritative district/state for the PIN).
  let pinInfo = { city: "", state: "", areas: [] };
  try { if (pin.length === 6) pinInfo = await lookupPincodeAreas(pin); } catch { /* keep empty */ }
  const pinValid = pin.length === 6 && !!(pinInfo.state || pinInfo.city);
  const custState = fullState(input.state);
  const pinState = fullState(pinInfo.state);
  const stateMatch = !custState || !pinState || custState === pinState;
  const pinConflict = pinValid && !!custState && !!pinState && custState !== pinState;
  const cityKnown = has(pinInfo.city) || has(input.city);

  const lineText = [input.line1, input.line2, input.line3].filter(Boolean).join(", ");
  const conf = scoreAddress({ pinValid, stateMatch, cityKnown, lineText, pinConflict });

  const verification = {
    verified: [
      pinValid ? `PIN ${pin} exists (India Post: ${pinInfo.city || "?"}, ${pinInfo.state || "?"})` : null,
      stateMatch && custState ? `State "${input.state}" consistent with PIN` : null,
    ].filter(Boolean),
    corrected: (review?.improved && review?.cleanedText) ? [`Address cleaned/enriched → ${review.cleanedText}`] : [],
    inferred: [], // the engine never asserts an inferred house/residence as verified
    conflicting: [
      pinConflict ? `Customer state "${input.state}" vs PIN ${pin} state "${pinInfo.state}" — resolve before dispatch` : null,
      review?.pinIssue ? String(review.pinIssue) : null,
    ].filter(Boolean),
    missing: [
      !hasHouseNumber(lineText) ? "House/flat number" : null,
      !hasLandmark(lineText) ? "A navigation landmark" : null,
      !pin || pin.length !== 6 ? "Valid 6-digit PIN" : null,
    ].filter(Boolean),
  };

  // ---- MODULE B: courier selection ----------------------------------------
  let suggestion = { suggested: null, reason: "", nearby: [], via: null, hasData: false };
  try { suggestion = await suggestNearestCourier(pin, pinState || custState, { best3 }); } catch { /* keep default */ }
  const courierTable = buildCourierTable(pinState || custState, suggestion.nearby);
  const rto = stateRTO(pinState || custState);

  // Best courier = the approved winner from proximity+history; honest about verification.
  // courierTable is already sorted best-first. If suggestNearestCourier named one of
  // the 5, prefer it (it blends proximity + our history) and carry its reason.
  let best = courierTable[0] || null;
  let bestNote = "";
  const suggestKey = String(suggestion.suggested || "").toLowerCase();
  const suggestedApproved = APPROVED_COURIERS.find((c) => c.toLowerCase() === suggestKey);
  if (suggestedApproved) {
    const match = courierTable.find((r) => r.courier === DISPLAY[suggestedApproved]);
    if (match) { best = match; bestNote = suggestion.reason; }
  }
  const anyServiceabilityVerified = false; // no live serviceability API wired yet
  const bestCourier = best
    ? { courier: best.courier, why: bestNote || `Best available signal: ${best.lastMile}. ${best.nearestFacility !== "UNKNOWN" ? "Has a nearby facility." : "No nearby facility found."}`, caution: "Live PIN serviceability + last-mile NOT API-verified — CHECK VELOCITY before dispatch." }
    : { courier: null, why: "NO VERIFIED COURIER — no proximity data and no per-area history.", caution: "CHECK VELOCITY BEFORE DISPATCH." };

  // ---- Dispatch verdict ----------------------------------------------------
  let verdict, verdictReason;
  if (pinConflict || conf.total < 50 || review?.route === "call") {
    verdict = conf.total < 35 || pinConflict ? "HOLD" : "SHIP AFTER CONFIRMATION";
    verdictReason = pinConflict ? "PIN/state conflict must be resolved first." : (review?.reason || "Address incomplete or ambiguous.");
  } else if (conf.total < 75) {
    verdict = "SHIP AFTER CONFIRMATION";
    verdictReason = "Good address with minor missing details (confirm the gap below).";
  } else {
    verdict = "SHIP";
    verdictReason = "Strong address evidence; no critical conflict.";
  }

  // ---- Customer message (only the missing info) ----------------------------
  let customerMessage = "";
  if (verification.missing.length || verification.conflicting.length) {
    const asks = [];
    if (pinConflict) asks.push(`confirm your PIN code (we have ${pin} = ${pinInfo.city || "?"}, ${pinInfo.state || "?"})`);
    if (!hasHouseNumber(lineText)) asks.push("your house/flat number");
    if (!hasLandmark(lineText)) asks.push("a nearby landmark (shop, temple, school)");
    if (asks.length) customerMessage = `Hi${input.name ? " " + input.name : ""}, to make sure your Viora order reaches you smoothly, could you please share ${asks.join(" and ")}? Thank you! — Team Viora Jewels`;
  }

  return {
    customer: { name: input.name || "", phone: input.phone || "", originalPin: pin, recommendedPin: review?.suggestedPincode || pin, locality: pinInfo.city || input.city || "", district: pinInfo.city || "", state: pinInfo.state || input.state || "" },
    before: lineText + (pin ? `, ${pin}` : ""),
    after: review?.cleanedText || review?.shipAddress || lineText,
    confidence: conf.total,
    confidenceBreakdown: conf.breakdown,
    verification,
    courierComparison: courierTable,
    stateRtoPct: rto?.rtoPct ?? null,
    bestCourier,
    serviceabilityVerified: anyServiceabilityVerified,
    verdict,
    verdictReason,
    customerMessage,
    meta: { proximityVia: suggestion.via, hadProximityData: suggestion.hasData, addressVerdict: review?.verdict, addressRoute: review?.route },
  };
}
