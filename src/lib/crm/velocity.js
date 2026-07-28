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
    username: process.env.VELOCITY_USERNAME, // registered mobile number
    password: process.env.VELOCITY_PASSWORD,
    warehouseId: process.env.VELOCITY_WAREHOUSE_ID, // pre-registered pickup warehouse
    trackBase: (process.env.VELOCITY_TRACK_URL_BASE || "https://shipfastt.in/track").replace(
      /\/$/,
      ""
    ),
    // Default parcel dimensions/weight when a per-order value isn't supplied.
    dims: {
      length: Number(process.env.VELOCITY_DEFAULT_LENGTH) || 10, // cm
      breadth: Number(process.env.VELOCITY_DEFAULT_BREADTH) || 10, // cm
      height: Number(process.env.VELOCITY_DEFAULT_HEIGHT) || 5, // cm
      weight: Number(process.env.VELOCITY_DEFAULT_WEIGHT) || 0.5, // kg
    },
    enabled: String(process.env.VELOCITY_ENABLED).toLowerCase() === "true",
    mock: String(process.env.VELOCITY_MOCK).toLowerCase() === "true",
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

  // We only carry a single product string on the normalized order, so ship one
  // order item with placeholder SKU/units unless the caller passed real items.
  const items =
    Array.isArray(o.items) && o.items.length
      ? o.items.map((it, i) => ({
          name: it.name || o.product || "Jewellery",
          sku: it.sku || `SKU-${i + 1}`,
          units: Number(it.quantity) || 1,
        }))
      : [{ name: o.product || "Jewellery", sku: "SKU-1", units: 1 }];

  return {
    order_id: o.orderId,
    order_date: formatOrderDate(new Date()),
    billing_customer_name: o.name || "Customer",
    billing_address: address.line1 || "",
    billing_city: address.city || "",
    billing_pincode: address.postalCode || "",
    billing_state: address.state || "",
    billing_country: address.country || "India",
    billing_phone: o.phone || "",
    payment_method: isCOD ? "COD" : "PREPAID",
    sub_total: amount,
    cod_collectible: isCOD ? amount : 0,
    length: c.dims.length,
    breadth: c.dims.breadth,
    height: c.dims.height,
    weight: c.dims.weight,
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

// ===========================================================================
// STATUS WEBHOOK (WF2/WF3) — STILL SCAFFOLD until Velocity sends the spec
// ===========================================================================

/**
 * Map a raw Velocity status webhook to our internal status enum.
 * TODO(velocity): replace the right-hand strings with Velocity's actual values.
 * @returns {"OUT_FOR_DELIVERY"|"DELIVERED"|"OTHER"}
 */
function normalizeStatus(raw) {
  const s = String(raw || "").toUpperCase().replace(/[\s-]+/g, "_");
  if (["OUT_FOR_DELIVERY", "OFD", "OUT_FOR_DELIVER"].includes(s)) return "OUT_FOR_DELIVERY";
  if (["DELIVERED", "DELIVER", "COMPLETED"].includes(s)) return "DELIVERED";
  return "OTHER";
}

/**
 * Pull { reference, awb, status } out of a Velocity status webhook body.
 * TODO(velocity): correct these paths to the real payload shape.
 */
function parseStatusWebhook(body) {
  const b = body || {};
  const data = b.data || b;
  return {
    reference: data.reference || data.order_id || data.client_order_id || null,
    awb: data.awb || data.waybill || data.awb_code || data.tracking_number || null,
    rawStatus: data.status || data.current_status || data.event || null,
    status: normalizeStatus(data.status || data.current_status || data.event),
  };
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
  buildShipmentPayload,
  getToken,
  normalizeStatus,
  parseStatusWebhook,
  verifyWebhook,
};
