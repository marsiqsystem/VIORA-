// Automatic ship-address pipeline.
//
// For every order that reaches the ship stage we want the SAME thing the operator
// used to do by hand: run the address through the AI cleaner, and then either
//   • SHIP  — the address is deliverable; apply the cleaned, courier-ready version
//             to the order (so Velocity/Shiprocket/iThink get the good address), or
//   • CALL  — a real problem remains the AI can't fix safely (missing street, a
//             wrong/invalid pincode, or the model itself says CONFIRM) → leave it
//             for the Call Queue, with a SUGGESTED correct pincode where we can
//             recover one from the area name.
//
// The AI never invents (its prompt only rearranges + adds a VERIFIED post-office
// landmark), the ORIGINAL address is always kept in `originalAddress` for
// recovery, and anything uncertain goes to a human — so auto-applying is safe.
//
// `reviewOrderAddress(order)`  → a verdict + cleaned lines + route + suggestion
//                                (read-only, no write).
// `processOrder(order,{apply})`→ review, always store the `aiAddr` summary on the
//                                order, and (when apply && route==="ship") write
//                                the cleaned structured address the couriers read.

import { formatAddress } from "./addressFormatter";
import { lookupPincode, suggestPincode } from "./pincode";
import * as ordersStore from "./orders-store";
import { fullState, stateRTO } from "./carrierEngine";
import { wixAdminClientServer } from "../wixAdminClientServer";

// Restore a ship-to street line that our store dropped but Wix still has (the
// addressLine2-drop safety-net — the root cause of several thin-label RTOs). Runs
// before the AI sees the address so it formats the FULL address. Best-effort.
async function restoreWixLine2(order, address) {
  if (String(address.line2 || "").trim() || !order?.orderGuid) return "";
  try {
    const wo = await wixAdminClientServer().orders.getOrder(order.orderGuid);
    const wa = wo?.shippingInfo?.logistics?.shippingDestination?.address || {};
    const wl2 = String(wa.addressLine2 || "").trim();
    if (wl2 && wl2.toLowerCase() !== String(address.line1 || "").trim().toLowerCase()) {
      address.line2 = wl2;
      return wl2;
    }
  } catch { /* best-effort — format with what we have */ }
  return "";
}

const _norm = (s) => String(s || "").trim().toLowerCase();
const _alnum = (s) => String(s || "").replace(/[^a-z0-9]/gi, "").length;
const clean = (s) => String(s || "").trim();
const pinOf = (a) => String(a?.postalCode || "").match(/\d{6}/)?.[0] || "";
const lineOf = (a) => [a?.line1, a?.line2, a?.line3].filter(Boolean).join(" ").trim();

// Same "is the street text basically empty?" test the Call Queue uses: after
// removing the city / state / pin there must be some house / street / locality
// left, else a courier could justifiably bounce it.
function isIncomplete(address) {
  const a = address || {};
  let strip = lineOf(a);
  for (const tok of [fullState(a.state), clean(a.city)].filter((t) => t && t.length > 1)) {
    strip = strip.replace(new RegExp(tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ");
  }
  const meaningful = strip.replace(/\d{6}/g, " ").replace(/[^a-z0-9]/gi, "");
  return meaningful.length < 4;
}

/**
 * Review one order's ship-to address with the AI cleaner + India Post, and decide
 * whether it can ship as-is (cleaned) or needs a call. Read-only.
 * @returns {Promise<{route:"ship"|"call", verdict:string, source:string,
 *   cleanedText:string, formatted:string[], shipAddress:object|null,
 *   reason:string, limitation:string, suggestedPincode:string,
 *   pinIssue:string, rtoPct:number|null, problems:string[]}>}
 */
export async function reviewOrderAddress(order, { force = false } = {}) {
  const a = { ...(order?.address || {}) }; // copy — never mutate the stored order
  // Safety-net: restore a dropped street line from Wix before the AI looks at it.
  const restoredLine2 = await restoreWixLine2(order, a);
  const pin = pinOf(a);

  // 1) AI clean (cached per order+fingerprint; an edit busts the cache on its own).
  const fmt = await formatAddress({
    orderId: order?.orderId,
    name: order?.name,
    phone: order?.phone || order?.waPhone,
    address: a,
    force,
  });

  // 2) Pincode health + a safe suggestion when it's wrong.
  let pinIssue = "";
  let suggestedPincode = "";
  let pinInfo = { city: "", state: "" };
  if (!pin) {
    pinIssue = "no-pin";
  } else {
    try { pinInfo = await lookupPincode(pin); } catch { /* unresolved */ }
    if (!pinInfo.state) pinIssue = "invalid-pin";
    else if (clean(a.state) && fullState(a.state) && fullState(pinInfo.state) && fullState(a.state) !== fullState(pinInfo.state)) pinIssue = "pin-mismatch";
  }
  if (pinIssue) {
    // Recover the correct pincode from the area/city the customer DID give.
    const hints = [a.city, a.line3, a.line2, a.line1].map(clean).filter((x) => x.length >= 3);
    for (const h of hints) {
      const sug = await suggestPincode(h, a.state || pinInfo.state);
      if (sug.pincode && sug.pincode !== pin) { suggestedPincode = sug.pincode; break; }
    }
  }

  // 3) Problems that force a human call (the AI can't safely invent its way out).
  const problems = [];
  if (fmt.verdict === "CONFIRM") problems.push("ai-confirm");
  if (pinIssue) problems.push(pinIssue);
  if (isIncomplete(a)) problems.push("address-incomplete");

  const rtoPct = (() => { const r = stateRTO(a.state); return r ? r.rtoPct : null; })();

  // 4) Build the courier-ready lines from the AI output, WITHOUT the customer name
  //    or the "Mobile:" line (those are not part of the shipping address).
  const city = clean(a.city) || clean(pinInfo.city);
  const state = clean(a.state) || clean(pinInfo.state);
  const formatted = Array.isArray(fmt.formatted) ? fmt.formatted.map(clean).filter(Boolean) : [];
  const nameNorm = _norm(order?.name);
  const streetLines = formatted.filter((ln) => {
    const t = clean(ln);
    if (!t) return false;
    if (nameNorm && _norm(t) === nameNorm) return false;           // drop the name line
    if (/^mobile\b/i.test(t) || /^phone\b/i.test(t)) return false; // drop the phone line
    const isCityStatePin =
      (pin && new RegExp(`\\b${pin}\\b`).test(t)) ||
      (!!city && _norm(t).includes(_norm(city)) && /\d{5,6}/.test(t));
    if (isCityStatePin) return false;                              // drop the city/state-pin line (rebuilt below)
    return true;
  });
  const shipAddress = streetLines.length
    ? {
        line1: streetLines[0] || clean(a.line1),
        line2: streetLines[1] || "",
        line3: streetLines.slice(2).join(", "),
        city,
        state,
        postalCode: pin,
        country: "India",
        raw: streetLines.join(", "),
      }
    : null;

  // 5) Route. Ship only when the model says SHIP (or the free fast-path verified a
  //    clean address) AND there's no hard pin/street problem.
  const okVerdict = fmt.verdict === "SHIP";
  const route = okVerdict && !problems.length && shipAddress ? "ship" : "call";

  return {
    route,
    verdict: fmt.verdict || "UNKNOWN",
    source: fmt.source || "",
    cleanedText: fmt.text || "",
    formatted,
    shipAddress,
    reason: fmt.reason || "",
    limitation: fmt.limitation || "",
    suggestedPincode,
    pinIssue,
    rtoPct,
    problems,
    restoredLine2,
    improved: fmt.source === "ai" || fmt.source === "cache" || !!restoredLine2,
  };
}

// A compact summary we stamp onto the order so the Ship Queue / Call Queue can
// read it without re-running the model.
function toAiAddr(review, applied) {
  return {
    verdict: review.verdict,
    route: review.route,
    source: review.source,
    reason: review.reason,
    limitation: review.limitation,
    suggestedPincode: review.suggestedPincode,
    pinIssue: review.pinIssue,
    problems: review.problems,
    cleanedText: review.cleanedText,
    applied: !!applied,
    at: Date.now(),
  };
}

/**
 * Review + persist. Always stamps `aiAddr` on the order. When `apply` and the
 * route is "ship", also writes the cleaned structured address the couriers read
 * (keeping the untouched original in `originalAddress`).
 * @returns {Promise<{orderId:string, route:string, verdict:string, applied:boolean,
 *   before:object, after:object|null, review:object}>}
 */
export async function processOrder(order, { apply = false, persist = true } = {}) {
  const review = await reviewOrderAddress(order);
  const before = order?.address || {};
  let applied = false;
  let after = null;

  if (!persist && !apply) {
    // Pure dry-run preview — never touch the store.
    return { orderId: String(order?.orderId || ""), route: review.route, verdict: review.verdict, applied: false, before, after: review.shipAddress, review };
  }

  // Only rewrite the stored address when the pipeline actually IMPROVED it — the
  // AI cleaned a messy address, or we restored a Wix-dropped street line. An
  // already-clean order (free deterministic pass) is left untouched (just stamped),
  // so we never reshape a good ship-to address for no reason.
  const improved = review.improved;
  if (apply && review.route === "ship" && review.shipAddress && improved) {
    const patch = {
      address: review.shipAddress,
      addressText: [review.shipAddress.raw, [review.shipAddress.city, review.shipAddress.state].filter(Boolean).join(", ") + (review.shipAddress.postalCode ? ` - ${review.shipAddress.postalCode}` : "")]
        .filter(Boolean)
        .join("\n"),
      addressEdited: true,
      aiAddr: toAiAddr(review, true),
    };
    // Keep the very first original for recovery (don't overwrite it on re-runs).
    if (!order?.originalAddress) patch.originalAddress = before;
    await ordersStore.updateOrder(order.orderId, patch);
    applied = true;
    after = review.shipAddress;
  } else {
    // Not applying (route=call, or apply=false/dry-run): just record the verdict.
    await ordersStore.updateOrder(order.orderId, { aiAddr: toAiAddr(review, false) });
  }

  return { orderId: String(order?.orderId || ""), route: review.route, verdict: review.verdict, applied, before, after, review };
}
