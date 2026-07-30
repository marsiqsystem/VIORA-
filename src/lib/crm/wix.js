// Wix as the single source of truth. This replaces the old SQLite store: the
// server is STATELESS middleware — it holds no order data of its own. Every
// read/write goes to Wix (order state, tracking, and the idempotency flags that
// used to live in sent_messages).
//
// Transport: the SAME @wix/sdk admin client the storefront already uses
// successfully (ApiKeyStrategy, modules orders + orderFulfillments) — see
// src/lib/wixAdminClientServer.ts. This replaced an earlier hand-rolled raw-REST
// layer whose endpoints/auth were never verified and returned 400s, which used
// to crash the webhook before the WhatsApp send.
//
// HARD RULE: every function here is NON-THROWING. A Wix failure returns
// null / { ok:false } and is logged — it must NEVER crash the caller, because
// the customer's WhatsApp confirmation must not depend on Wix bookkeeping.
//
// Safety gates mirror velocity.js / whatsapp.js:
//   WIX_MOCK=true (or WIX_ENABLED=false) -> no network; an in-process Map stands
//   in for the Wix DB so the whole pipeline still runs in dry-run.

import { extractOrderInfo } from "./wixOrder";
import { wixAdminClientServer } from "../wixAdminClientServer";

const CC = () => process.env.DEFAULT_COUNTRY_CODE || "91";

// Extended-fields namespace where we store WhatsApp idempotency flags + the AWB.
const NS = "@viora/whatsapp";

function cfg() {
  return {
    enabled: String(process.env.WIX_ENABLED).trim().toLowerCase() === "true",
    mock: String(process.env.WIX_MOCK).trim().toLowerCase() === "true",
  };
}
const isMock = () => {
  const c = cfg();
  return c.mock || !c.enabled;
};

/** Lazily build the shared admin client. Throws if creds missing — always call
 * inside a try/catch so a missing-cred setup degrades gracefully. */
function client() {
  return wixAdminClientServer();
}

// --- MOCK Wix DB (simulates the EXTERNAL store; not production server state) --
const mockDB = new Map(); // orderId -> normalized order (+ .awb index)

/**
 * Normalize a Wix SDK order object into the shape notify.js expects. Reuses the
 * same defensive extractor the webhook path uses (deep-find fallbacks tolerate
 * either the webhook body shape or a fetched SDK order).
 */
function normalize(wixOrder) {
  if (!wixOrder) return null;
  const info = extractOrderInfo({ data: wixOrder, order: wixOrder }, CC());
  const flags = wixOrder.extendedFields?.namespaces?.[NS] || wixOrder._flags || {};
  const status = wixOrder.fulfillmentStatus || wixOrder.status || "PLACED";
  const deliveredAt = flags.delivered_at
    ? Date.parse(flags.delivered_at) || null
    : status === "FULFILLED"
      ? Date.parse(wixOrder._updatedDate || wixOrder.updatedDate) || null
      : null;
  return {
    orderId: info.orderId || wixOrder.number || wixOrder._id || null,
    // The Wix GUID — every Wix write (fulfillment, extendedFields flag, delivered
    // stamp) keys on this, not the human order number.
    orderGuid: info.orderGuid || wixOrder._id || wixOrder.id || null,
    phone: info.phone,
    name: info.customerName,
    product: info.product,
    amount: info.amount,
    paymentMode: info.paymentMode,
    awb: flags.awb || null,
    trackingUrl: flags.tracking_url || null,
    status,
    deliveredAt,
    flags,
  };
}

// ===========================================================================
// READS
// ===========================================================================

/** Fetch one order by its Wix GUID. Returns normalized order or null (never throws). */
async function getOrder(orderId) {
  if (isMock()) return mockDB.get(String(orderId)) || null;
  try {
    const order = await client().orders.getOrder(orderId);
    return normalize(order);
  } catch (e) {
    // Bad id / not found / perms — treat as "no order" so idempotency reads
    // never block a send. Logged for visibility.
    console.warn(`[wix] getOrder failed for ${orderId}:`, e?.message || e);
    return null;
  }
}

/** Fallback correlation by AWB. Primary correlation is the Wix GUID that Velocity
 * echoes back, so this is rarely needed; Wix doesn't expose tracking number as a
 * filterable field, so in real mode we safely no-op. */
async function findOrderByAwb(awb) {
  if (!awb) return null;
  if (isMock()) {
    for (const rec of mockDB.values()) if (rec.awb === awb) return rec;
    return null;
  }
  console.warn("[wix] findOrderByAwb: relying on GUID correlation (no tracking-number filter).");
  return null;
}

/**
 * Orders delivered at least `olderThanMs` ago that don't yet carry `flagKey`.
 * Drives the WF4 review scheduler with NO local DB. Never throws.
 */
async function queryDeliveredNeedingReview(olderThanMs, flagKey) {
  const cutoff = Date.now() - olderThanMs;
  if (isMock()) {
    return [...mockDB.values()].filter(
      (o) => o.status === "DELIVERED" && o.deliveredAt && o.deliveredAt <= cutoff && !o.flags?.[flagKey]
    );
  }
  try {
    const res = await client().orders.searchOrders({
      filter: { fulfillmentStatus: "FULFILLED" },
      cursorPaging: { limit: 100 },
    });
    const orders = res?.orders || [];
    return orders
      .map(normalize)
      .filter((o) => o && o.deliveredAt && o.deliveredAt <= cutoff && !o.flags?.[flagKey]);
  } catch (e) {
    console.warn("[wix] queryDeliveredNeedingReview failed:", e?.message || e);
    return [];
  }
}

// ===========================================================================
// WRITES  (Wix holds everything — tracking, delivery state, idempotency flags)
// ===========================================================================

/**
 * Push the carrier AWB + tracking URL BACK onto the Wix order (as a fulfillment
 * with trackingInfo), so the storefront tracking timeline reads it. Never throws.
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
  try {
    const c = client();
    // createFulfillment needs the order's line items (id + quantity) to fulfill.
    let lineItems;
    try {
      const order = await c.orders.getOrder(orderId);
      lineItems = (order?.lineItems || [])
        .filter((li) => li?._id)
        .map((li) => ({ _id: li._id, quantity: li.quantity ?? 1 }));
    } catch {
      /* fall through — attempt without explicit line items */
    }
    const fulfillment = {
      ...(lineItems && lineItems.length ? { lineItems } : {}),
      trackingInfo: {
        trackingNumber: awb,
        shippingProvider: carrier,
        trackingLink: trackingUrl,
      },
    };
    const data = await c.orderFulfillments.createFulfillment(orderId, fulfillment);
    // Also stash the AWB in our flags so getOrder/normalize can surface it without
    // a second fulfillments read.
    await setFlag(orderId, "awb", awb);
    if (trackingUrl) await setFlag(orderId, "tracking_url", trackingUrl);
    return { ok: true, dryRun: false, data };
  } catch (e) {
    console.warn(`[wix] pushTracking failed for ${orderId}:`, e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

/** Mark the order delivered (stamps the time the review queue reads). Best-effort
 * flag write; the storefront timeline also derives delivered from Velocity's live
 * status, so this never needs to change the Wix fulfillmentStatus. Never throws. */
async function markDelivered(orderId, deliveredAt = Date.now()) {
  if (isMock()) {
    const rec = mockDB.get(String(orderId));
    if (rec) {
      rec.status = "DELIVERED";
      rec.deliveredAt = deliveredAt;
    }
    return { ok: true, dryRun: true };
  }
  return setFlag(orderId, "delivered_at", new Date(deliveredAt).toISOString());
}

/** Read an idempotency flag off an already-fetched (normalized) order. */
const getFlag = (order, key) => Boolean(order?.flags?.[key]);

/**
 * Set an idempotency flag (or value) on the Wix order's extended fields. Reads
 * the current namespace first and merges so we never clobber sibling flags.
 * Non-atomic read→write (dedupes webhook retries fine; two truly-simultaneous
 * webhooks could still race). Never throws — returns { ok:false } on failure so
 * a bookkeeping miss never turns a delivered message into a crash.
 */
async function setFlag(orderId, key, value = true) {
  if (isMock()) {
    const rec = mockDB.get(String(orderId));
    if (rec) (rec.flags = rec.flags || {})[key] = value;
    return { ok: true, dryRun: true };
  }
  try {
    const c = client();
    let existing = {};
    try {
      const cur = await c.orders.getOrder(orderId);
      existing = cur?.extendedFields?.namespaces?.[NS] || {};
    } catch {
      /* proceed with just this key if we can't read current */
    }
    await c.orders.updateOrder(orderId, {
      extendedFields: { namespaces: { [NS]: { ...existing, [key]: value } } },
    });
    return { ok: true, dryRun: false };
  } catch (e) {
    console.warn(`[wix] setFlag ${key} failed for ${orderId}:`, e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * MOCK bridge: in mock mode, seed the fake Wix DB with an order we "received" so
 * later stateless fetches find it. In production this is a no-op.
 */
function ensureMockOrder(order) {
  if (!isMock()) return;
  const id = String(order.orderId);
  if (!mockDB.has(id)) {
    mockDB.set(id, {
      orderId: id,
      orderGuid: order.orderGuid || null,
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
