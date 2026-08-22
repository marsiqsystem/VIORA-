// Courier advisor — powers the dashboard's courier picker: given an order's
// destination (state) + payment mode + customer history, it returns a risk level,
// human warnings, and a suggested courier. Pure/stateless: you pass in the order
// and the full order history (the dashboard already has both), it returns advice.
//
// Baseline state RTO tiers are seeded from the 2026-08 Regional RTO analysis
// (COD ~54% RTO vs Prepaid ~0%; worst J&K/Delhi/Punjab/Gujarat, best Karnataka/
// WB/TN). As live orders accumulate real per-state / per-courier outcomes, those
// override the seed.

// State name -> risk tier from the regional RTO report. Lowercased, trimmed keys.
const STATE_TIER = {
  // high RTO
  "jammu and kashmir": "high", "jammu & kashmir": "high", "j&k": "high",
  "delhi": "high", "punjab": "high", "gujarat": "high", "bihar": "high",
  "haryana": "high", "uttar pradesh": "high",
  // low RTO
  "karnataka": "low", "west bengal": "low", "tamil nadu": "low",
  "kerala": "low", "maharashtra": "low", "telangana": "low",
};

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

/**
 * @param {{paymentMode?:string,address?:{state?:string},phone?:string,orderId?:string}} order
 * @param {Array} history  all stored orders (for per-state/courier/customer stats)
 * @returns {{risk:"low"|"medium"|"high", score:number, warnings:string[], suggestedCourier:string|null, reason:string}}
 */
function advise(order, history = []) {
  const warnings = [];
  let score = 0; // 0..100 RTO-risk-ish
  const isCOD = norm(order?.paymentMode) !== "prepaid" && norm(order?.paymentMode) !== "";
  const state = norm(order?.address?.state);

  // 1) Payment mode — the single biggest RTO driver in the data.
  if (isCOD) {
    score += 45;
    warnings.push("COD order — historically ~54% of RTOs are COD. Consider nudging to prepaid.");
  }

  // 2) Destination state tier.
  const tier = STATE_TIER[state];
  if (tier === "high") {
    score += 35;
    warnings.push(`High-RTO region (${order?.address?.state}). Ship carefully / prefer a confirmed address.`);
  } else if (tier === "low") {
    score -= 10;
  } else if (state) {
    score += 5;
  }

  // 3) Live per-state RTO rate (overrides/augments the seed once we have volume).
  if (state && history.length) {
    const inState = history.filter(
      (o) => norm(o?.address?.state) === state && ["delivered", "rto"].includes(o.status)
    );
    if (inState.length >= 5) {
      const rto = inState.filter((o) => o.status === "rto").length;
      const rate = (rto / inState.length) * 100;
      if (rate >= 40) {
        score += 20;
        warnings.push(`${order?.address?.state}: live RTO rate ${rate.toFixed(0)}% (${rto}/${inState.length}).`);
      }
    }
  }

  // 4) Repeat-RTO customer (by phone).
  if (order?.phone && history.length) {
    const prior = history.filter((o) => o.phone === order.phone && o.orderId !== order.orderId);
    const priorRto = prior.filter((o) => o.status === "rto").length;
    if (priorRto >= 1) {
      score += 25;
      warnings.push(`Repeat customer with ${priorRto} past RTO${priorRto > 1 ? "s" : ""} — verify before shipping.`);
    }
  }

  score = Math.max(0, Math.min(100, score));
  const risk = score >= 60 ? "high" : score >= 30 ? "medium" : "low";

  // Suggested courier: the one with the best delivery rate in this state (min
  // volume), else the overall best, else null (let the operator choose).
  const suggested = bestCourierFor(state, history);

  return {
    risk,
    score,
    warnings,
    suggestedCourier: suggested?.courier || null,
    reason: suggested?.reason || (tier === "high" || isCOD ? "High RTO risk — pick your most reliable courier." : "Low risk."),
  };
}

// Pick the courier with the best delivered/(delivered+rto) rate, preferring
// same-state data with enough volume, falling back to overall.
function bestCourierFor(state, history) {
  const tally = (orders) => {
    const m = {};
    for (const o of orders) {
      if (!o.courier || !["delivered", "rto"].includes(o.status)) continue;
      const e = (m[o.courier] ||= { delivered: 0, total: 0 });
      e.total++;
      if (o.status === "delivered") e.delivered++;
    }
    let best = null;
    for (const [courier, e] of Object.entries(m)) {
      if (e.total < 3) continue;
      const rate = e.delivered / e.total;
      if (!best || rate > best.rate) best = { courier, rate, total: e.total };
    }
    return best;
  };
  const inState = state ? tally(history.filter((o) => norm(o?.address?.state) === state)) : null;
  const chosen = inState || tally(history);
  if (!chosen) return null;
  return {
    courier: chosen.courier,
    reason: `${chosen.courier} has the best delivery rate ${(chosen.rate * 100).toFixed(0)}% (${chosen.total} shipped${inState ? " here" : ""}).`,
  };
}

export { advise, bestCourierFor, STATE_TIER };
