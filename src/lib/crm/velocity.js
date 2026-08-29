// Single place that talks to the Velocity shipping/fulfillment API.
//
// STATUS: LIVE forward-shipment integration (auth + create-shipment are the real
// Velocity endpoints). The status-webhook helpers at the bottom
// (normalizeStatus / parseStatusWebhook / verifyWebhook) are STILL SCAFFOLD —
// Velocity's tracking-webhook spec hasn't been provided yet — so they keep their
// TODO(velocity) markers.
//
// Auth model (real): POST /custom/api/v1/auth-token with {username, password}
// returns {token, expires_at}. The token goes in a *bare* Authorization header
// (NOT "Bearer <token>") on every subsequent call. We cache it in-module and
// only refetch when it is missing, near expiry, or the API answers 401.
//
// Two safety gates mirror lib/whatsapp.js so nothing hits the real carrier by
// accident:
//   VELOCITY_MOCK=true     -> never call the network; return a fake AWB so the
//                             whole Wix -> Velocity -> WhatsApp pipeline runs
//                             end-to-end in dry-run.
//   VELOCITY_ENABLED=false -> even if not mocking, treat as dry-run.

import { withRetry } from "./reliability";

// Refresh the token this many ms before its stated expiry so an in-flight
// request never races the expiry boundary.
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
// Fallback token lifetime when the auth response omits/!parses expires_at.
const TOKEN_DEFAULT_TTL_MS = 30 * 60_000;

function cfg() {
  return {
    baseUrl: (process.env.VELOCITY_BASE_URL || "https://shazam.velocity.in").replace(/\/$/, ""),
    // .trim() every credential — a stray space/newline pasted into the Vercel
    // dashboard would otherwise silently 401 the auth-token call.
    username: (process.env.VELOCITY_USERNAME || "").trim(), // registered mobile number
    password: (process.env.VELOCITY_PASSWORD || "").trim(),
    warehouseId: (process.env.VELOCITY_WAREHOUSE_ID || "").trim(), // pre-registered pickup warehouse
    pickupLocation: (process.env.VELOCITY_PICKUP_LOCATION || "").trim(), // warehouse display name (API requires it)
    trackBase: (process.env.VELOCITY_TRACK_URL_BASE || "https://viorajewel.velocityshipping.in/track")
      // Customer tracking host = the Viora-branded page configured in the Velocity
      // portal: viorajewel.velocityshipping.in/track/<AWB> (set 2026-08-17).
      // Rewrite the old wrong hosts (shipfast.in / shipfastt.in typo) AND the
      // generic www.velocityshipping.in host up to the branded subdomain, even if
      // a stale value is still set in the env, so links always land on the brand.
      .replace(/https?:\/\/(www\.)?shipfastt?\.in/gi, "https://www.velocityshipping.in")
      .replace(/https?:\/\/(www\.)?velocityshipping\.in/gi, "https://viorajewel.velocityshipping.in")
      .replace(/\/$/, ""),
    // Viora's standard jewellery package — FIXED. Hardcoded (not env) so a wrong
    // VELOCITY_DEFAULT_* value in a dashboard can't silently change it (a stale
    // env was sending breadth 10 instead of 12). Height & weight scale with
    // quantity in buildShipmentPayload; length & breadth stay constant.
    dims: {
      length: 18, // cm
      breadth: 12, // cm
      height: 4, // cm (per unit)
      weight: 0.2, // kg (per unit)
    },
    enabled: String(process.env.VELOCITY_ENABLED).trim().toLowerCase() === "true",
    mock: String(process.env.VELOCITY_MOCK).trim().toLowerCase() === "true",
  };
}

// ===========================================================================
// AUTH TOKEN (in-memory cache, refreshed on expiry or 401)
// ===========================================================================

let tokenCache = null; // { token, expiresAt }

/** Turn the API's `expires_at` into absolute epoch-ms, with a safe fallback. */
function parseExpiry(expiresAt) {
  if (expiresAt != null) {
    const t = new Date(expiresAt).getTime();
    if (Number.isFinite(t) && t > Date.now()) return t;
  }
  return Date.now() + TOKEN_DEFAULT_TTL_MS;
}

/**
 * Return a valid auth token, using the cache while it's comfortably in-date.
 * `forceRefresh` bypasses the cache (used after a 401). Throws on auth failure.
 */
async function getToken(forceRefresh = false) {
  const c = cfg();
  if (
    !forceRefresh &&
    tokenCache &&
    tokenCache.expiresAt - TOKEN_EXPIRY_MARGIN_MS > Date.now()
  ) {
    return tokenCache.token;
  }

  const res = await fetch(`${c.baseUrl}/custom/api/v1/auth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: c.username, password: c.password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    const err = new Error(`velocity auth failed HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  tokenCache = { token: data.token, expiresAt: parseExpiry(data.expires_at) };
  console.log("[velocity] auth token refreshed.");
  return data.token;
}

// ===========================================================================
// CREATE FORWARD SHIPMENT
// ===========================================================================

/** Format a date as "YYYY-MM-DD HH:mm" in IST, regardless of server timezone. */
function formatOrderDate(d) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/**
 * Map OUR normalized order -> Velocity's forward-order-orchestration body.
 *
 * @param {{orderId,name,phone,amount,paymentMode,product,address,items}} o
 */
function buildShipmentPayload(o) {
  const c = cfg();
  const address = o.address || {};
  const isCOD = o.paymentMode !== "PREPAID";
  const amount = Number(o.amount) || 0;

  // DEFENSE-IN-DEPTH: never let a non-product fee line (our COD "Delivery + COD
  // Charges" SERVICE line) reach the shipment — it would be counted as an extra
  // unit and inflate volumetric weight/height (see wixOrder.isFeeLineItem, which
  // already filters it upstream in extractItems). This second guard catches it
  // even if a caller ever hands buildShipmentPayload items from another source.
  const isFeeItem = (it) => {
    const nm = String(it?.name || "").toLowerCase();
    return nm.includes("cod charge") || nm.includes("delivery + cod") || nm.includes("delivery and cod");
  };
  const productItems = Array.isArray(o.items) ? o.items.filter((it) => !isFeeItem(it)) : [];

  // We only carry a single product string on the normalized order, so ship one
  // order item with placeholder SKU/units unless the caller passed real items.
  const items =
    productItems.length
      ? productItems.map((it, i) => ({
          name: it.name || o.product || "Jewellery",
          sku: it.sku || `SKU-${i + 1}`,
          units: Number(it.quantity) || 1,
          selling_price: Number(it.price) || Number(o.amount) || 0,
        }))
      : [{ name: o.product || "Jewellery", sku: "SKU-1", units: 1, selling_price: amount }];

  // Package dimensions scale with quantity. The default box (18 x 12 x 4 cm,
  // 0.2 kg) holds ONE unit; every extra unit is stacked on top, so only the
  // HEIGHT grows — length & breadth stay fixed — and weight adds up per unit.
  // e.g. qty 2 -> 18 x 12 x 8 cm, 0.4 kg.
  const totalUnits = items.reduce((sum, it) => sum + (Number(it.units) || 1), 0) || 1;

  return {
    // Velocity order_id = "VJ-#<Wix order number>" (e.g. VJ-#10207) so the
    // Velocity dashboard id visibly matches the Wix/site/email order (#10207) and
    // is easy to reconcile. The status webhook echoes this back as
    // order_external_id; velocity-webhook strips the "VJ-#" prefix and correlates
    // by number (wix.findOrderByNumber, with getOrder/AWB as fallbacks). Falls
    // back to the GUID only if no human number is available.
    order_id: o.orderId ? `VJ-#${o.orderId}` : o.orderGuid,
    order_date: formatOrderDate(new Date()),
    billing_customer_name: o.name || "Customer",
    billing_address: address.line1 || "",
    billing_city: address.city || "",
    billing_pincode: address.postalCode || "",
    billing_state: address.state || "",
    billing_country: address.country || "India",
    billing_phone: o.phone || "",
    payment_method: isCOD ? "COD" : "PREPAID",
    print_label: true, // REQUIRED by Velocity: auto-generate the shipping label
    pickup_location: c.pickupLocation || "", // REQUIRED: the warehouse's display name
    sub_total: amount,
    cod_collectible: isCOD ? amount : 0,
    length: c.dims.length,
    breadth: c.dims.breadth,
    height: c.dims.height * totalUnits,
    weight: Number((c.dims.weight * totalUnits).toFixed(3)),
    warehouse_id: c.warehouseId,
    order_items: items,
  };
}

/**
 * Create a forward shipment. Returns { ok, dryRun, awb, trackingUrl, raw }.
 * Never throws — a shipping failure must not crash the order webhook.
 */
async function createShipment(o) {
  const c = cfg();
  const body = buildShipmentPayload(o);

  // Mock / disabled -> fabricate a deterministic AWB so downstream (Wix tracking
  // write-back + WhatsApp tracking button) has something real-looking to work
  // with, without touching the carrier.
  if (c.mock || !c.enabled) {
    const awb = `MOCK-${o.orderId}`;
    const trackingUrl = `${c.trackBase}/${awb}`;
    console.log(
      `[velocity] MOCK createShipment (VELOCITY_MOCK/ENABLED gate) -> awb=${awb}`
    );
    console.log("[velocity] would POST body:", JSON.stringify(body, null, 2));
    return { ok: true, dryRun: true, awb, trackingUrl, raw: { mock: true } };
  }

  if (!c.baseUrl || !c.username || !c.password || !c.warehouseId) {
    console.error(
      "[velocity] VELOCITY_BASE_URL / VELOCITY_USERNAME / VELOCITY_PASSWORD / VELOCITY_WAREHOUSE_ID not fully set."
    );
    return { ok: false, dryRun: false, error: "velocity not configured" };
  }

  try {
    return await withRetry(
      async () => {
        const post = (token) =>
          fetch(`${c.baseUrl}/custom/api/v1/forward-order-orchestration`, {
            method: "POST",
            headers: {
              Authorization: token, // bare token, NOT "Bearer <token>"
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });

        let token = await getToken();
        let res = await post(token);

        // Token rejected mid-life (rotated/revoked): refresh once and retry.
        if (res.status === 401) {
          tokenCache = null;
          token = await getToken(true);
          res = await post(token);
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = new Error(`velocity create failed HTTP ${res.status}`);
          err.status = res.status;
          err.data = data;
          throw err; // let withRetry decide (5xx/429 retried, 4xx not)
        }

        // Success contract: status === 1 and payload.awb_code present.
        const awb = data?.payload?.awb_code;
        if (data?.status !== 1 || !awb) {
          // A business-level rejection (e.g. bad pincode) — identical on retry,
          // so return rather than throw. Not retried.
          console.error(
            "[velocity] create returned non-success:",
            JSON.stringify(data).slice(0, 400)
          );
          return {
            ok: false,
            dryRun: false,
            error: data?.message || `velocity status=${data?.status}`,
            raw: data,
          };
        }

        return {
          ok: true,
          dryRun: false,
          awb,
          trackingUrl: `${c.trackBase}/${awb}`,
          raw: data,
        };
      },
      { label: "velocity.createShipment", retries: 3 }
    );
  } catch (err) {
    console.error("[velocity] createShipment failed:", err?.message || err);
    return { ok: false, dryRun: false, error: err?.message || String(err), data: err?.data };
  }
}

/**
 * CREATE-ONLY: create a forward order WITHOUT assigning a courier or generating
 * an AWB (Velocity's `/forward-order` endpoint, vs `/forward-order-orchestration`
 * which also ships). The order lands in Velocity's "New Orders" list with NO
 * wallet deduction (response: order_created:1, awb_generated:0); the user picks a
 * courier + ships it manually there later. Never throws.
 * Returns { ok, dryRun, velocityOrderId, shipmentId, raw }.
 */
async function createOrderOnly(o) {
  const c = cfg();
  const body = buildShipmentPayload(o);

  if (c.mock || !c.enabled) {
    console.log("[velocity] MOCK createOrderOnly (VELOCITY_MOCK/ENABLED gate) — no network.");
    console.log("[velocity] would POST /forward-order:", JSON.stringify(body, null, 2));
    return {
      ok: true,
      dryRun: true,
      velocityOrderId: `MOCK-ORD-${o.orderId}`,
      shipmentId: `MOCK-SHIP-${o.orderId}`,
      raw: { mock: true },
    };
  }

  if (!c.baseUrl || !c.username || !c.password || !c.warehouseId) {
    console.error("[velocity] creds not fully set — cannot create order.");
    return { ok: false, dryRun: false, error: "velocity not configured" };
  }

  try {
    return await withRetry(
      async () => {
        const post = (token) =>
          fetch(`${c.baseUrl}/custom/api/v1/forward-order`, {
            method: "POST",
            headers: { Authorization: token, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

        let token = await getToken();
        let res = await post(token);
        if (res.status === 401) {
          tokenCache = null;
          token = await getToken(true);
          res = await post(token);
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = new Error(`velocity create-order failed HTTP ${res.status}`);
          err.status = res.status;
          err.data = data;
          throw err; // withRetry: 5xx/429 retried, 4xx not
        }

        // Success contract for create-only: status===1 and payload.order_created
        // (awb_code is intentionally absent here — no courier assigned yet).
        if (data?.status !== 1 || !data?.payload?.order_created) {
          console.error(
            "[velocity] create-order returned non-success:",
            JSON.stringify(data).slice(0, 400)
          );
          return {
            ok: false,
            dryRun: false,
            error: data?.message || `velocity status=${data?.status}`,
            raw: data,
          };
        }

        return {
          ok: true,
          dryRun: false,
          velocityOrderId: data.payload.order_id || null,
          shipmentId: data.payload.shipment_id || null,
          raw: data,
        };
      },
      { label: "velocity.createOrderOnly", retries: 3 }
    );
  } catch (err) {
    console.error("[velocity] createOrderOnly failed:", err?.message || err);
    return { ok: false, dryRun: false, error: err?.message || String(err), data: err?.data };
  }
}

// ===========================================================================
// STATUS WEBHOOK (WF2/WF3) — written against Velocity's tracking payload shape
// (Shiprocket-style: shipment_status / tracking_number / order_external_id).
// Signature verification (verifyWebhook) is the only remaining scaffold — it
// stays open until Velocity confirms their secret/HMAC header.
// ===========================================================================

/**
 * Map a raw Velocity status webhook to our internal status enum. We only act on
 * the two states that trigger a customer message (WF2/WF3); everything else is
 * OTHER and acknowledged with a 200.
 * @returns {"DISPATCHED"|"OUT_FOR_DELIVERY"|"DELIVERED"|"RTO"|"CANCELLED"|"OTHER"}
 */
function normalizeStatus(raw) {
  const s = String(raw || "").toUpperCase().replace(/[\s-]+/g, "_");
  // RTO / returned FIRST — a returned shipment must never be mistaken for a
  // delivery/dispatch (any "RTO_*" or "RETURN*" state). It suppresses the review.
  if (s.startsWith("RTO") || s.startsWith("RETURN")) return "RTO";
  // Check OUT_FOR_DELIVERY before the dispatched synonyms so an "out for
  // delivery" scan is never misread as a first dispatch.
  if (["OUT_FOR_DELIVERY", "OFD", "OUT_FOR_DELIVER"].includes(s)) return "OUT_FOR_DELIVERY";
  if (["DELIVERED", "DELIVER", "COMPLETED"].includes(s)) return "DELIVERED";
  // Order packed & handed to the courier / moving = "dispatched" (WhatsApp
  // message #2 with the tracking link). Velocity's dashboard shows this as
  // "In transit"; other carriers phrase it as shipped / picked up / manifested.
  if (
    [
      "IN_TRANSIT", "INTRANSIT", "TRANSIT",
      "SHIPPED", "DISPATCHED", "DISPATCH",
      "PICKED_UP", "PICKUP", "PICKUP_DONE", "PICKUP_COMPLETE", "PICKUP_COMPLETED",
      "SHIPMENT_PICKED_UP", "MANIFESTED", "IN_TRANSIT_",
    ].includes(s)
  ) {
    return "DISPATCHED";
  }
  // Order cancelled at the fulfilment stage. RTO (return-to-origin) is a distinct
  // state and deliberately NOT mapped here — we don't message "cancelled" for a
  // return. "REJECTED" is Velocity's label when the order is killed BEFORE
  // shipping — most commonly the customer declines it on the AI confirmation
  // call — so from the customer's side it IS a cancellation and gets the same
  // (once-only, deduped) cancellation message.
  if (["CANCELLED", "CANCELED", "CANCEL", "REJECTED", "REJECT", "REJECTED_BY_CUSTOMER"].includes(s))
    return "CANCELLED";
  return "OTHER";
}

// Force any tracking URL (from Velocity's API/webhook) onto the Viora-branded
// host viorajewel.velocityshipping.in — matches cfg().trackBase, so every surface
// (WhatsApp, Wix order, storefront timeline) shows the branded tracking page.
// Returns null for an empty/missing url (preserves the existing `|| null` shape).
function brandTrackUrl(url) {
  const out = String(url || "")
    .replace(/https?:\/\/(www\.)?shipfastt?\.in/gi, "https://www.velocityshipping.in")
    .replace(/https?:\/\/(www\.)?velocityshipping\.in/gi, "https://viorajewel.velocityshipping.in");
  return out || null;
}

/**
 * Pull { reference, awb, status } out of a Velocity status webhook body.
 * reference = the order_id we sent at creation (the Wix GUID), echoed back as
 * order_external_id; awb = tracking_number. Falls back through legacy field names.
 */
function parseStatusWebhook(body) {
  const b = body || {};
  const data = b.data || b;
  return {
    // order_external_id is the order_id WE sent to Velocity at creation (the Wix
    // order GUID) — the reliable key back to the Wix order. tracking_number = AWB.
    reference: data.order_external_id || data.order_id || data.reference || null,
    awb: data.tracking_number || data.awb || data.awb_code || null,
    trackingUrl: brandTrackUrl(data.tracking_url),
    rawStatus: data.status || data.current_status || null,
    status: normalizeStatus(data.status || data.current_status),
  };
}

/**
 * Live tracking for the storefront timeline. POST /custom/api/v1/order-tracking
 * with the AWB -> current shipment_status + activity list. Never throws.
 * @returns {Promise<{ok:boolean, status?:string, activities?:any[], trackUrl?:string, error?:any}>}
 */
async function trackShipment(awb) {
  const c = cfg();
  if (c.mock || !c.enabled) {
    return { ok: true, dryRun: true, status: "in_transit", activities: [], trackUrl: `${c.trackBase}/${awb}` };
  }
  if (!awb) return { ok: false, error: "no awb" };
  try {
    return await withRetry(
      async () => {
        const post = (token) =>
          fetch(`${c.baseUrl}/custom/api/v1/order-tracking`, {
            method: "POST",
            headers: { Authorization: token, "Content-Type": "application/json" },
            body: JSON.stringify({ awbs: [awb] }),
          });
        let token = await getToken();
        let res = await post(token);
        if (res.status === 401) {
          tokenCache = null;
          token = await getToken(true);
          res = await post(token);
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const e = new Error(`velocity track failed HTTP ${res.status}`);
          e.status = res.status;
          throw e;
        }
        const rec = data?.result?.[awb]?.tracking_data || {};
        return {
          ok: true,
          dryRun: false,
          status:
            rec.shipment_status ||
            rec.shipment_track?.[0]?.current_status ||
            null,
          activities: rec.shipment_track_activities || [],
          trackUrl: brandTrackUrl(rec.track_url) || `${c.trackBase}/${awb}`,
          raw: data,
        };
      },
      { label: "velocity.trackShipment", retries: 2 }
    );
  } catch (err) {
    console.error("[velocity] trackShipment failed:", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Verify a Velocity webhook is genuine.
 * TODO(velocity): implement the real check (HMAC signature header / shared
 * secret / IP allowlist). For now: if VELOCITY_WEBHOOK_SECRET is set, require a
 * matching header; otherwise allow (scaffold).
 */
function verifyWebhook(secretHeader) {
  const secret = process.env.VELOCITY_WEBHOOK_SECRET;
  if (!secret) return true; // check disabled during scaffolding
  return secretHeader === secret;
}

export {
  createShipment,
  createOrderOnly,
  buildShipmentPayload,
  getToken,
  trackShipment,
  normalizeStatus,
  parseStatusWebhook,
  verifyWebhook,
};
