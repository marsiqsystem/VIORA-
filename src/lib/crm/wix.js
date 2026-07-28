// Wix as the single source of truth. This replaces the old SQLite store: the
// Node server is now STATELESS middleware — it holds no order data of its own.
// Every read/write goes to Wix (customer, address, order state, tracking, and
// the idempotency flags that used to live in sent_messages).
//
// Transport: raw Wix REST (https://www.wixapis.com). The @wix/sdk just wraps
// these same endpoints; REST keeps this dependency-free and stable. Auth is an
// API key + site id header. Search "TODO(wix)" for the exact endpoint paths /
// field names to confirm against your Wix app's API docs + permissions.
//
// Safety gates mirror velocity.js / whatsapp.js:
//   WIX_MOCK=true  (or WIX_ENABLED=false) -> no network; an in-process Map
//   stands in for the Wix DB so the whole pipeline still runs in dry-run.
//   The mock Map is ONLY populated under mock mode — it is never used as server
//   state in production (where these functions hit real Wix).

import { withRetry } from "./reliability";
import { extractOrderInfo } from "./wixOrder";

const REST = "https://www.wixapis.com";
const CC = () => process.env.DEFAULT_COUNTRY_CODE || "91";

function cfg() {
  return {
    apiKey: process.env.WIX_API_KEY,
    siteId: process.env.WIX_SITE_ID,
    accountId: process.env.WIX_ACCOUNT_ID,
    enabled: String(process.env.WIX_ENABLED).toLowerCase() === "true",
    mock: String(process.env.WIX_MOCK).toLowerCase() === "true",
  };
}
const isMock = () => {
  const c = cfg();
  return c.mock || !c.enabled;
};

function authHeaders() {
  const c = cfg();
  return {
    Authorization: c.apiKey, // TODO(wix): confirm API-key auth scheme
    "wix-site-id": c.siteId,
    "Content-Type": "application/json",
  };
}

// --- MOCK Wix DB (simulates the EXTERNAL store; not production server state) --
// Records are already in our normalized camelCase shape.
const mockDB = new Map(); // orderId -> normalized order (+ _awb index kept in .awb)

/**
 * Normalize a raw Wix REST order into the shape notify.js expects.
 * Reuses the same defensive extractor the webhook path uses.
 */
function normalize(wixOrder) {
  const info = extractOrderInfo({ order: wixOrder }, CC());
  const fulfillment = wixOrder.fulfillmentStatus || wixOrder.status;
  const flags =
    wixOrder.extendedFields?.namespaces?.["@viora/whatsapp"] || // TODO(wix): confirm namespace
    wixOrder._flags ||
    {};
  return {
    orderId: info.orderId,
    // The Wix GUID — every Wix write (fulfillment, extendedFields flag, delivered
    // stamp) keys on this, not the human order number.
    orderGuid: info.orderGuid || wixOrder._id || wixOrder.id || null,
    phone: info.phone,
    name: info.customerName,
    product: info.product,
    amount: info.amount,
    paymentMode: info.paymentMode,
    awb: wixOrder.awb || wixOrder.trackingNumber || null, // TODO(wix): real tracking field
    trackingUrl: wixOrder.trackingUrl || null,
    status: fulfillment || "PLACED",
    deliveredAt: wixOrder.deliveredAt || null,
    flags,
  };
}

// ===========================================================================
// READS
// ===========================================================================

/** Fetch one order by its Wix id. Returns normalized order or null. */
async function getOrder(orderId) {
  if (isMock()) return mockDB.get(String(orderId)) || null;
  return withRetry(
    async () => {
      // TODO(wix): GET order endpoint.
      const res = await fetch(`${REST}/ecom/v1/orders/${orderId}`, { headers: authHeaders() });
      if (res.status === 404) return null;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error(`wix getOrder ${res.status}`);
        e.status = res.status;
        throw e;
      }
      return normalize(data.order || data);
    },
    { label: "wix.getOrder" }
  );
}

/** Fallback correlation: find an order by its shipping AWB / tracking number. */
async function findOrderByAwb(awb) {
  if (!awb) return null;
  if (isMock()) {
    for (const rec of mockDB.values()) if (rec.awb === awb) return rec;
    return null;
  }
  return withRetry(
    async () => {
      // TODO(wix): Orders Search filtering by fulfillment tracking number.
      const res = await fetch(`${REST}/ecom/v1/orders/search`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          search: { filter: { "fulfillments.trackingInfo.trackingNumber": awb } },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error(`wix search ${res.status}`);
        e.status = res.status;
        throw e;
      }
      const first = (data.orders || [])[0];
      return first ? normalize(first) : null;
    },
    { label: "wix.findOrderByAwb" }
  );
}

/**
 * Orders delivered at least `olderThanMs` ago that don't yet carry `flagKey`.
 * Drives the WF4 review scheduler with NO local DB.
 */
async function queryDeliveredNeedingReview(olderThanMs, flagKey) {
  const cutoff = Date.now() - olderThanMs;
  if (isMock()) {
    return [...mockDB.values()].filter(
      (o) => o.status === "DELIVERED" && o.deliveredAt && o.deliveredAt <= cutoff && !o.flags?.[flagKey]
    );
  }
  return withRetry(
    async () => {
      // TODO(wix): Orders Search — fulfillmentStatus=FULFILLED/DELIVERED AND
      // delivered date <= cutoff. Flag filtering done client-side below since
      // extendedFields aren't always filterable.
      const res = await fetch(`${REST}/ecom/v1/orders/search`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          search: { filter: { fulfillmentStatus: "FULFILLED" } },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error(`wix review-query ${res.status}`);
        e.status = res.status;
        throw e;
      }
      return (data.orders || [])
        .map(normalize)
        .filter((o) => o.deliveredAt && o.deliveredAt <= cutoff && !o.flags?.[flagKey]);
    },
    { label: "wix.queryDeliveredNeedingReview" }
  );
}

// ===========================================================================
// WRITES  (Wix holds everything — tracking, delivery state, idempotency flags)
// ===========================================================================

/**
 * Phase 1 step 3: push the carrier AWB + tracking URL BACK onto the Wix order
 * (as a fulfillment), so the storefront UI inherently shows tracking.
 */
async function pushTracking(orderId, { awb, trackingUrl, carrier = "Velocity" }) {
  if (isMock()) {
    const rec = mockDB.get(String(orderId));
    if (rec) {
      rec.awb = awb;
      rec.trackingUrl = trackingUrl;
    }
    console.log(`[wix] MOCK pushTracking order=${orderId} awb=${awb}`);
    return { ok: true, dryRun: true };
  }
  return withRetry(
    async () => {
      // TODO(wix): Create Fulfillment with trackingInfo{trackingNumber, shippingProvider, trackingLink}.
      const res = await fetch(`${REST}/ecom/v1/fulfillments/orders/${orderId}/create-fulfillment`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          fulfillment: {
            trackingInfo: { trackingNumber: awb, shippingProvider: carrier, trackingLink: trackingUrl },
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error(`wix pushTracking ${res.status}`);
        e.status = res.status;
        e.data = data;
        throw e;
      }
      return { ok: true, dryRun: false, data };
    },
    { label: "wix.pushTracking" }
  );
}

/** Mark the order delivered in Wix (stamps the time the review queue reads). */
async function markDelivered(orderId, deliveredAt = Date.now()) {
  if (isMock()) {
    const rec = mockDB.get(String(orderId));
    if (rec) {
      rec.status = "DELIVERED";
      rec.deliveredAt = deliveredAt;
    }
    return { ok: true, dryRun: true };
  }
  // TODO(wix): update fulfillment status -> DELIVERED (+ timestamp).
  return withRetry(
    async () => {
      const res = await fetch(`${REST}/ecom/v1/orders/${orderId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ order: { fulfillmentStatus: "FULFILLED", deliveredAt } }),
      });
      if (!res.ok) {
        const e = new Error(`wix markDelivered ${res.status}`);
        e.status = res.status;
        throw e;
      }
      return { ok: true, dryRun: false };
    },
    { label: "wix.markDelivered" }
  );
}

/** Read an idempotency flag off an already-fetched (normalized) order. */
const getFlag = (order, key) => Boolean(order?.flags?.[key]);

/**
 * Set an idempotency flag on the Wix order (replaces the old sent_messages
 * ledger). NOTE: this is a non-atomic read→write, unlike SQLite's INSERT OR
 * IGNORE — two truly-simultaneous webhooks could both pass the getFlag check
 * before either setFlag lands. Webhook *retries* (the common duplicate source)
 * are still deduped fine.
 */
async function setFlag(orderId, key) {
  if (isMock()) {
    const rec = mockDB.get(String(orderId));
    if (rec) (rec.flags = rec.flags || {})[key] = true;
    return { ok: true, dryRun: true };
  }
  // TODO(wix): PATCH order extendedFields namespace to set {[key]: true}.
  return withRetry(
    async () => {
      const res = await fetch(`${REST}/ecom/v1/orders/${orderId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          order: { extendedFields: { namespaces: { "@viora/whatsapp": { [key]: true } } } },
        }),
      });
      if (!res.ok) {
        const e = new Error(`wix setFlag ${res.status}`);
        e.status = res.status;
        throw e;
      }
      return { ok: true, dryRun: false };
    },
    { label: "wix.setFlag" }
  );
}

/**
 * MOCK bridge: in mock mode, seed the fake Wix DB with an order we "received"
 * so later stateless fetches (getOrder / findOrderByAwb / review query) find it.
 * In production this is a no-op — real Wix already stores the order it created.
 */
function ensureMockOrder(order) {
  if (!isMock()) return;
  const id = String(order.orderId);
  if (!mockDB.has(id)) {
    mockDB.set(id, {
      orderId: id,
      phone: order.phone,
      name: order.name,
      product: order.product,
      amount: order.amount,
      paymentMode: order.paymentMode,
      awb: null,
      trackingUrl: null,
      status: "PLACED",
      deliveredAt: null,
      flags: {},
    });
  }
}

export {
  getOrder,
  findOrderByAwb,
  queryDeliveredNeedingReview,
  pushTracking,
  markDelivered,
  getFlag,
  setFlag,
  ensureMockOrder,
  normalize,
  isMock,
  mockDB as _mockDB,
};
