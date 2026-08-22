// Persistent ORDERS store for the unified Viora dashboard.
//
// The CRM is otherwise stateless (orders are re-read from Wix on demand), but the
// dashboard needs a durable, queryable order log that carries state Wix does NOT
// hold: which COURIER we chose, the live shipment STATUS, the FREIGHT + RTO cost
// pulled from the courier's payments, and the computed PROFIT. So — exactly like
// lib/crm/inbox-store.js — we keep a tiny Upstash/Vercel-KV (Redis REST) store.
//
// Layout (mirrors inbox-store):
//   orders:index          ZSET   member=orderId   score=createdAtMs   (newest first)
//   orders:<orderId>      STRING JSON blob of the full order record
//
// Transport: Upstash Redis REST via plain fetch — no SDK. One command per POST as
// a JSON array, e.g. ["SET", key, val]; response is { result: ... }.
//
// Env (either name works, set by the Vercel KV / Upstash integration):
//   KV_REST_API_URL   or  UPSTASH_REDIS_REST_URL
//   KV_REST_API_TOKEN or  UPSTASH_REDIS_REST_TOKEN
//
// FAIL-SAFE: every function swallows KV errors and returns a benign value — a
// dashboard/store hiccup must NEVER break the order webhook or a customer
// message. Nothing here throws.

const PREFIX = "orders:";
// The order-id index. We deliberately use a plain Redis SET (SADD/SMEMBERS) under
// a private, versioned key and sort in JS — NOT a ZSET. The earlier "orders:index"
// zset behaved incoherently in this shared KV (ZADD ok + ZSCORE ok, but ZCARD=0
// and ZREVRANGE returned foreign junk like "Count"/"589"), i.e. that key was
// occupied/managed by something outside this codebase. A private SET avoids the
// flaky range/card ops entirely.
const INDEX_KEY = "orders:ids:v1";
const key = (orderId) => `${PREFIX}${orderId}`;

function kvCfg() {
  return {
    url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "")
      .trim()
      .replace(/\/$/, ""),
    token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim(),
  };
}

/** True when a Redis KV is actually configured for this deployment. */
function isConfigured() {
  const { url, token } = kvCfg();
  return !!url && !!token;
}

/** POST one Redis command as a JSON array; returns parsed `result` (or throws). */
async function command(args) {
  const { url, token } = kvCfg();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store", // never let Next.js serve a cached KV response
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`kv command failed HTTP ${res.status}`);
    err.data = data;
    throw err;
  }
  return data?.result;
}

// The fields the store tracks. Kept flat + explicit so the dashboard table and the
// Google-Sheet export have a stable schema. `courier`/status/freight/rtoCost/etc
// start empty and get filled later (picker → webhook → payments pull).
function blankRecord() {
  return {
    orderId: "",
    orderGuid: "",
    createdAt: 0, // epoch ms the order was placed (webhook time)
    name: "",
    phone: "",
    email: "",
    product: "", // Wix product name
    productId: "",
    dCode: "", // internal D-00x code (resolved from product; editable)
    colour: "",
    qty: 1,
    sellingPrice: 0, // per-order total selling value
    paymentMode: "", // PREPAID | COD
    address: null, // { line1, city, state, postalCode, country }
    // --- fulfilment (filled after creation) ---
    courier: "", // "" = not yet assigned (HOLD). e.g. "velocity" | "ithink"
    courierOrderId: "",
    awb: "",
    trackingUrl: "",
    status: "new", // new | created | dispatched | out_for_delivery | delivered | rto | cancelled | on_hold | not_shipped
    statusAt: 0,
    // Raw courier sub-statuses (preserved from historical Excel / future webhooks).
    deliveryStatus: "",
    pickupStatus: "",
    transitStatus: "",
    // --- money (filled from courier payments; freight already includes hidden COD) ---
    freight: null, // combined shipping + hidden COD, from Velocity Payments
    goodsCost: null, // base + ₹30 packaging × qty
    prepaidFee: null, // Razorpay 2% (prepaid only)
    codFee: null, // legacy per-qty COD fee (Velocity folds COD into freight)
    profit: null, // selling − goodsCost − freight − prepaidFee − rtoCost
    rtoCost: null,
    paymentReceived: "", // yes/no (courier remittance received)
    inStock: "",
    source: "", // "wix-webhook" | "backfill-excel" — where the record came from
    updatedAt: 0,
  };
}

/** Read one order record, or null. Never throws. */
async function getOrder(orderId) {
  if (!isConfigured() || !orderId) return null;
  try {
    const raw = await command(["GET", key(orderId)]);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("[orders-store] getOrder failed:", e?.message || e);
    return null;
  }
}

/**
 * Record an order at placement time (called from the Wix webhook). Idempotent
 * UPSERT: if the order already exists, base fields are refreshed but fulfilment
 * state already set (courier/awb/status/freight/rtoCost) is PRESERVED — a
 * duplicate webhook must never wipe a courier assignment. Never throws.
 * @returns {Promise<{ok:boolean, created?:boolean}>}
 */
async function recordOrder(order) {
  if (!isConfigured() || !order?.orderId) return { ok: false };
  try {
    const existing = await getOrder(order.orderId);
    const now = Date.now();
    const base = existing || blankRecord();
    const rec = {
      ...base,
      orderId: String(order.orderId),
      orderGuid: order.orderGuid || base.orderGuid || "",
      createdAt: base.createdAt || now,
      name: order.name || base.name || "",
      phone: order.phone || base.phone || "",
      email: order.email || base.email || "",
      product: order.product || base.product || "",
      productId: order.productId || base.productId || "",
      dCode: order.dCode || base.dCode || "",
      colour: order.colour || base.colour || "",
      qty: Number(order.qty ?? order.quantity ?? base.qty) || 1,
      sellingPrice: Number(order.sellingPrice ?? order.amount ?? base.sellingPrice) || 0,
      paymentMode: order.paymentMode || base.paymentMode || "",
      address: order.address || base.address || null,
      updatedAt: now,
    };
    await command(["SET", key(rec.orderId), JSON.stringify(rec)]);
    await command(["SADD", INDEX_KEY, rec.orderId]);
    return { ok: true, created: !existing };
  } catch (e) {
    console.warn("[orders-store] recordOrder failed:", e?.message || e);
    return { ok: false };
  }
}

/**
 * Merge a patch into an existing order (courier assignment, status update,
 * freight/RTO from payments, etc). Creates a blank record if the order isn't
 * stored yet (so a webhook status can land even before the order was recorded).
 * Never throws. @returns {Promise<{ok:boolean}>}
 */
async function updateOrder(orderId, patch) {
  if (!isConfigured() || !orderId) return { ok: false };
  try {
    const base = (await getOrder(orderId)) || { ...blankRecord(), orderId: String(orderId), createdAt: Date.now() };
    const rec = { ...base, ...patch, orderId: String(orderId), updatedAt: Date.now() };
    await command(["SET", key(rec.orderId), JSON.stringify(rec)]);
    // Ensure it's in the index even if this update arrived before recordOrder.
    await command(["SADD", INDEX_KEY, rec.orderId]);
    return { ok: true };
  } catch (e) {
    console.warn("[orders-store] updateOrder failed:", e?.message || e);
    return { ok: false };
  }
}

/**
 * List orders newest-first for the dashboard table.
 * @param {{limit?:number, offset?:number}} opts
 * @returns {Promise<{orders:Array, total:number}>}
 */
async function listOrders({ limit = 200, offset = 0 } = {}) {
  if (!isConfigured()) return { orders: [], total: 0 };
  try {
    const ids = (await command(["SMEMBERS", INDEX_KEY])) || [];
    if (!ids.length) return { orders: [], total: 0 };
    // MGET every blob, then sort newest-first IN JS (avoids the flaky zset range).
    const blobs = (await command(["MGET", ...ids.map(key)])) || [];
    const all = blobs
      .map((b) => {
        try {
          return b ? JSON.parse(b) : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    all.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    const total = all.length;
    const orders = all.slice(offset, offset + Math.max(0, limit));
    return { orders, total };
  } catch (e) {
    console.warn("[orders-store] listOrders failed:", e?.message || e);
    return { orders: [], total: 0 };
  }
}

export { recordOrder, updateOrder, getOrder, listOrders, isConfigured, blankRecord };
