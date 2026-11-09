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
import { fullState, stateRTO, fakeRatePct } from "./carrierEngine";
import { rankCouriersByProximity } from "./courierProximity";

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

// Turn the proximity ranking (distance to the customer's address) into the 5-courier
// comparison. PRIMARY ranking is distance — a closer hub means a genuine delivery
// attempt, not a fake-attempt RTO. Our per-area history is attached only as a
// secondary WARNING (e.g. "known to fake attempts here"), never as the ranking driver.
function buildCourierTable(proxCouriers) {
  return (proxCouriers || []).map((c, i) => {
    const fake = fakeRatePct(c.courier.replace(/\s/g, "")); // "Blue Dart" -> "BlueDart" best-effort
    const fakeAlt = fakeRatePct(c.courier);
    const fakePct = Math.max(fake, fakeAlt);
    return {
      courier: c.courier,
      rank: c.found ? i + 1 : null,
      nearestFacility: c.nearestFacility || "UNKNOWN — no map listing found",
      facilityType: c.facilityType,
      distanceKm: c.distanceKm, // null when no facility/coords found
      proximityNote: c.distanceKm != null
        ? `${c.distanceKm} km from the customer — ${c.distanceKm <= 8 ? "very close, strong genuine-attempt odds" : c.distanceKm <= 20 ? "moderate distance" : "far — higher fake-attempt risk"}`
        : "No hub found on the map for this area yet",
      historyWarning: fakePct >= 20 ? `⚠️ ${fakePct}% fake-attempt RTO in our data for this region` : "",
    };
  });
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

  // ---- MODULE B: courier selection (PROXIMITY-FIRST, map evidence only) ----
  // Rank the 5 approved couriers by how close their nearest hub is to the customer's
  // ADDRESS (searched on the map). We deliberately do NOT use Velocity serviceability
  // — it reports "serviceable" where no real hub exists, which is exactly what causes
  // fake-attempt RTOs. Closest real hub = highest genuine-delivery odds.
  const addressText = review?.cleanedText || lineText;
  let prox = { customer: null, couriers: [] };
  try { prox = await rankCouriersByProximity({ pin, city: pinInfo.city || input.city, state: pinState || custState, addressText }); } catch { /* keep default */ }
  const courierTable = buildCourierTable(prox.couriers);
  const rto = stateRTO(pinState || custState);

  // Best courier = the CLOSEST hub to the address. Warn if that nearest courier is a
  // known fake-attempter in this region, and name the next-closest as backup.
  const found = courierTable.filter((r) => r.distanceKm != null);
  let bestCourier;
  if (found.length) {
    const top = found[0];
    bestCourier = {
      courier: top.courier,
      why: `Nearest courier hub to the customer's address — ${top.distanceKm} km away (${top.facilityType}). Closest hub = most likely a genuine delivery attempt.`,
      caution: [top.historyWarning, found[1] ? `Backup: ${found[1].courier} (${found[1].distanceKm} km).` : ""].filter(Boolean).join(" "),
    };
  } else {
    bestCourier = {
      courier: null,
      why: "No courier hub found on the map for this area yet (free OSM coverage is sparse here).",
      caution: "Adding the Google CSE key unlocks full map search for these areas; until then choose from the region's known couriers.",
    };
  }

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
    customerGeo: prox.customer ? { lat: prox.customer.lat, lon: prox.customer.lon, matched: prox.customer.matched } : null,
    verdict,
    verdictReason,
    customerMessage,
    meta: { couriersWithHub: courierTable.filter((r) => r.distanceKm != null).length, addressVerdict: review?.verdict, addressRoute: review?.route },
  };
}
