// Viora Coins — a server-authoritative loyalty wallet (1 coin = ₹1), KV-backed
// (Upstash). The balance lives ONLY here, keyed by the shopper's Wix member id
// (contactId), and is never trusted from the client. Every earn is idempotent
// (keyed so it can't double-grant) and every spend is claim-once per order, so
// the system can't be farmed or cracked. No expiry.
//
// Earning (all server-verified events):
//   review 75  · first login 10  · prepaid order placed 30  · COD delivered 20
// Spending: applied as a server-side discount at checkout (stacks on top of the
// Wix ladder coupon), decremented once the order is actually placed.
//
// DORMANT until COINS_ENABLED=1 — with it unset every function is a no-op /
// returns 0, so the engine can ship with the site untouched.

const PREFIX = "coins:";
const BAL = (id) => `${PREFIX}bal:${id}`;
const EARN = (key) => `${PREFIX}earn:${key}`; // idempotency marker
const SPEND = (orderId) => `${PREFIX}spend:${orderId}`; // claim-once marker
const UNSEEN = (id) => `${PREFIX}unseen:${id}`; // pending congratulations popups

function coinsEnabled() {
  return process.env.COINS_ENABLED === "1";
}

function kvCfg() {
  return {
    url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "")
      .trim()
      .replace(/\/$/, ""),
    token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim(),
  };
}
function isConfigured() {
  const { url, token } = kvCfg();
  return !!url && !!token;
}
async function command(args) {
  const { url, token } = kvCfg();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`kv command failed HTTP ${res.status}`);
  return data?.result;
}

const clean = (id) => String(id || "").trim();
const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};

/** Current coin balance for a member (0 when disabled / unknown / KV blip). */
export async function getBalance(contactId) {
  const id = clean(contactId);
  if (!coinsEnabled() || !isConfigured() || !id) return 0;
  try {
    return Math.max(0, toInt(await command(["GET", BAL(id)])));
  } catch {
    return 0;
  }
}

/**
 * Credit coins to a member, ONCE per reasonKey. The reasonKey encodes the event
 * so the same review / login / order can never grant twice:
 *   review:<contactId> · signup:<contactId> · prepaid:<orderId> · coddeliv:<orderId>
 * Pushes a "congratulations" note for the next popup. Never throws.
 * @returns {Promise<{earned:boolean, amount:number, balance:number}>}
 */
export async function earn({ contactId, amount, reasonKey, note } = {}) {
  const id = clean(contactId);
  const amt = Math.round(Number(amount) || 0);
  if (!coinsEnabled() || !isConfigured() || !id || amt <= 0 || !reasonKey) {
    return { earned: false, amount: 0, balance: await getBalance(id) };
  }
  try {
    // Claim the event marker first — only the winner credits the coins.
    const claimed = await command(["SET", EARN(reasonKey), String(Date.now()), "NX"]);
    if (claimed !== "OK") {
      return { earned: false, amount: 0, balance: await getBalance(id) };
    }
    const balance = Math.max(0, toInt(await command(["INCRBY", BAL(id), String(amt)])));
    try {
      await command([
        "LPUSH",
        UNSEEN(id),
        JSON.stringify({ amount: amt, note: note || "", at: Date.now() }),
      ]);
    } catch {
      /* popup note is best-effort */
    }
    return { earned: true, amount: amt, balance };
  } catch (e) {
    console.warn("[vioraCoins] earn failed:", e?.message || e);
    return { earned: false, amount: 0, balance: await getBalance(id) };
  }
}

/**
 * Spend coins against an order, CLAIM-ONCE per orderId. `amount` is decided at
 * checkout as min(balance, order-value) by the caller. Re-processing the same
 * order returns the already-claimed amount without decrementing again, so a
 * retry can never double-spend. Clamps the balance at 0. Never throws.
 * @returns {Promise<{spent:number}>}
 */
export async function spend({ contactId, amount, orderId } = {}) {
  const id = clean(contactId);
  const oid = clean(orderId);
  const amt = Math.round(Number(amount) || 0);
  if (!coinsEnabled() || !isConfigured() || !id || !oid || amt <= 0) return { spent: 0 };
  try {
    const claimed = await command(["SET", SPEND(oid), JSON.stringify({ id, amt }), "NX"]);
    if (claimed !== "OK") {
      // Already claimed for this order — return what we recorded, no re-decrement.
      try {
        const raw = await command(["GET", SPEND(oid)]);
        const rec = raw ? (typeof raw === "object" ? raw : JSON.parse(raw)) : {};
        return { spent: toInt(rec.amt) };
      } catch {
        return { spent: 0 };
      }
    }
    let balance = toInt(await command(["DECRBY", BAL(id), String(amt)]));
    if (balance < 0) {
      await command(["SET", BAL(id), "0"]);
      balance = 0;
    }
    return { spent: amt };
  } catch (e) {
    console.warn("[vioraCoins] spend failed:", e?.message || e);
    return { spent: 0 };
  }
}

/**
 * Give back coins spent on an order that ultimately failed / was cancelled.
 * Reverses the claim so the customer isn't charged coins for nothing. Never throws.
 */
export async function refund({ contactId, orderId } = {}) {
  const id = clean(contactId);
  const oid = clean(orderId);
  if (!coinsEnabled() || !isConfigured() || !id || !oid) return;
  try {
    const raw = await command(["GET", SPEND(oid)]);
    if (!raw) return;
    const rec = typeof raw === "object" ? raw : JSON.parse(raw);
    const amt = toInt(rec.amt);
    // Always credit the member who actually spent (stored on the claim), not
    // whoever triggered the refund — robust if the two ids ever differ.
    const spender = clean(rec.id) || id;
    if (amt > 0) await command(["INCRBY", BAL(spender), String(amt)]);
    await command(["DEL", SPEND(oid)]);
  } catch (e) {
    console.warn("[vioraCoins] refund failed:", e?.message || e);
  }
}

const RESERVE = (key) => `${PREFIX}reserve:${key}`; // atomic checkout hold

/**
 * ATOMICALLY reserve up to `amount` coins, capped to the live balance, for a
 * checkout. The decrement happens HERE (before the order's discount is computed),
 * so two orders placed at the same instant can never both spend the same coins —
 * the second reserves only what's left. Claim-once per reserveKey (a checkout
 * retry returns the same reservation, never double-decrements). Returns the
 * amount actually held. Release it with releaseReserve (order failed) or bind it
 * to the order with commitReserveToOrder (order placed). Never throws.
 * @returns {Promise<{reserved:number}>}
 */
export async function reserve({ contactId, amount, reserveKey } = {}) {
  const id = clean(contactId);
  const amt = Math.round(Number(amount) || 0);
  const rkRaw = clean(reserveKey);
  if (!coinsEnabled() || !isConfigured() || !id || !rkRaw || amt <= 0) return { reserved: 0 };
  const rk = RESERVE(rkRaw);
  try {
    // Gate the decrement so concurrent retries of the SAME checkout can't stack.
    const claimed = await command(["SET", rk, "pending", "NX"]);
    if (claimed !== "OK") {
      // Already reserved for this checkout — return what was held (idempotent).
      try {
        const raw = await command(["GET", rk]);
        if (!raw || raw === "pending") return { reserved: 0 };
        const rec = typeof raw === "object" ? raw : JSON.parse(raw);
        return { reserved: toInt(rec.amt) };
      } catch {
        return { reserved: 0 };
      }
    }
    // Atomic decrement, then cap to what was actually available by restoring any
    // overshoot. (Redis serialises commands, so the sum across concurrent reserves
    // can never exceed the starting balance.)
    const newBal = toInt(await command(["DECRBY", BAL(id), String(amt)]));
    let reserved = amt;
    if (newBal < 0) {
      await command(["INCRBY", BAL(id), String(-newBal)]); // balance back to 0
      reserved = amt + newBal; // amount − overshoot
      if (reserved < 0) reserved = 0;
    }
    await command(["SET", rk, JSON.stringify({ id, amt: reserved })]);
    return { reserved };
  } catch (e) {
    console.warn("[vioraCoins] reserve failed:", e?.message || e);
    try {
      await command(["DEL", rk]); // let a retry proceed
    } catch {
      /* ignore */
    }
    return { reserved: 0 };
  }
}

/** Give back a reservation whose order never completed. Never throws. */
export async function releaseReserve({ reserveKey } = {}) {
  if (!coinsEnabled() || !isConfigured() || !clean(reserveKey)) return;
  const rk = RESERVE(clean(reserveKey));
  try {
    const raw = await command(["GET", rk]);
    if (!raw) return;
    if (raw !== "pending") {
      const rec = typeof raw === "object" ? raw : JSON.parse(raw);
      const amt = toInt(rec.amt);
      const id = clean(rec.id);
      if (amt > 0 && id) await command(["INCRBY", BAL(id), String(amt)]);
    }
    await command(["DEL", rk]);
  } catch (e) {
    console.warn("[vioraCoins] releaseReserve failed:", e?.message || e);
  }
}

/**
 * Bind a completed reservation to the order id: records the spend under the
 * orderId (claim-once) so the existing cancel/RTO refund (keyed by orderId)
 * works, WITHOUT decrementing again — the coins were already held at reserve
 * time. Never throws. @returns {Promise<{spent:number}>}
 */
export async function commitReserveToOrder({ reserveKey, orderId } = {}) {
  const oid = clean(orderId);
  if (!coinsEnabled() || !isConfigured() || !clean(reserveKey) || !oid) return { spent: 0 };
  const rk = RESERVE(clean(reserveKey));
  try {
    const raw = await command(["GET", rk]);
    if (!raw || raw === "pending") return { spent: 0 };
    const rec = typeof raw === "object" ? raw : JSON.parse(raw);
    const amt = toInt(rec.amt);
    const id = clean(rec.id);
    if (amt <= 0 || !id) {
      await command(["DEL", rk]);
      return { spent: 0 };
    }
    await command(["SET", SPEND(oid), JSON.stringify({ id, amt }), "NX"]);
    await command(["DEL", rk]);
    return { spent: amt };
  } catch (e) {
    console.warn("[vioraCoins] commitReserveToOrder failed:", e?.message || e);
    return { spent: 0 };
  }
}

/** Has this earn reason already been credited? (for "claimed ✓" UI). */
export async function hasEarned(reasonKey) {
  if (!coinsEnabled() || !isConfigured() || !reasonKey) return false;
  try {
    return !!(await command(["GET", EARN(reasonKey)]));
  } catch {
    return false;
  }
}

/** Coins spent on an order (0 if none / disabled) — for the receipt line. */
export async function getSpent(orderId) {
  const oid = clean(orderId);
  if (!coinsEnabled() || !isConfigured() || !oid) return 0;
  try {
    const raw = await command(["GET", SPEND(oid)]);
    if (!raw) return 0;
    const rec = typeof raw === "object" ? raw : JSON.parse(raw);
    return Math.max(0, toInt(rec.amt));
  } catch {
    return 0;
  }
}

/**
 * Claw back an EARN that should not have been kept — e.g. a prepaid order that
 * granted +30 coins and was then cancelled/refunded. Reverses ONCE per reasonKey
 * and only if that earn actually happened, so it can't go negative or double-
 * reverse, and a normal (uncancelled) order is never touched. Never throws.
 * @returns {Promise<{reversed:boolean, amount:number, balance:number}>}
 */
export async function reverseEarn({ contactId, reasonKey, amount } = {}) {
  const id = clean(contactId);
  const amt = Math.round(Number(amount) || 0);
  if (!coinsEnabled() || !isConfigured() || !id || !reasonKey || amt <= 0) {
    return { reversed: false, amount: 0, balance: await getBalance(id) };
  }
  try {
    // Only reverse an earn that was actually credited.
    const earned = await command(["GET", EARN(reasonKey)]);
    if (!earned) return { reversed: false, amount: 0, balance: await getBalance(id) };
    // ...and only once — claim a reversal marker.
    const claimed = await command(["SET", `${PREFIX}earnrev:${reasonKey}`, String(Date.now()), "NX"]);
    if (claimed !== "OK") return { reversed: false, amount: 0, balance: await getBalance(id) };
    let balance = toInt(await command(["DECRBY", BAL(id), String(amt)]));
    if (balance < 0) {
      await command(["SET", BAL(id), "0"]);
      balance = 0;
    }
    return { reversed: true, amount: amt, balance };
  } catch (e) {
    console.warn("[vioraCoins] reverseEarn failed:", e?.message || e);
    return { reversed: false, amount: 0, balance: await getBalance(id) };
  }
}

/**
 * Pop all unseen earn notes for the congratulations popup, clearing them so each
 * is shown once. Aggregates into a single total. Never throws.
 * @returns {Promise<{total:number, count:number}>}
 */
export async function takeUnseen(contactId) {
  const id = clean(contactId);
  if (!coinsEnabled() || !isConfigured() || !id) return { total: 0, count: 0 };
  try {
    const items = (await command(["LRANGE", UNSEEN(id), "0", "-1"])) || [];
    if (!items.length) return { total: 0, count: 0 };
    await command(["DEL", UNSEEN(id)]);
    let total = 0;
    for (const it of items) {
      try {
        const o = typeof it === "object" ? it : JSON.parse(it);
        total += toInt(o.amount);
      } catch {
        /* skip a malformed note */
      }
    }
    return { total, count: items.length };
  } catch {
    return { total: 0, count: 0 };
  }
}

export { isConfigured, coinsEnabled };
