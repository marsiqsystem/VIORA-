// Single place that talks to the Shiprocket shipping/fulfillment API.
//
// Deliberately mirrors lib/crm/velocity.js so the two couriers are
// interchangeable behind the dashboard picker / assign-courier route:
//   - createOrderOnly(o)  -> order lands in Shiprocket "New Orders", NO AWB,
//                            NO wallet deduction; operator ships it there later.
//   - createShipment(o)   -> create the order AND assign an AWB (auto-picks the
//                            cheapest serviceable courier) so a label exists now.
//   - trackShipment(awb)  -> live tracking for the storefront timeline.
//   - parseStatusWebhook  -> map Shiprocket's status webhook to our internal enum.
//
// Shiprocket's REST base is https://apiv2.shiprocket.in/v1/external. Auth is a
// JWT from POST /auth/login {email,password}; it goes in a Bearer header and is
// valid ~10 days, so we cache it in-module and refetch on 401/403 or near expiry.
//
// Two safety gates mirror velocity.js so nothing hits the real carrier by
// accident:
//   SHIPROCKET_MOCK=true      -> never call the network; return a fake AWB so the
//                                whole Wix -> Shiprocket -> WhatsApp pipeline runs
//                                end-to-end in dry-run.
//   SHIPROCKET_ENABLED=false  -> even if not mocking, treat as dry-run.

import { withRetry } from "./reliability";

// Shiprocket JWTs live ~10 days. Cache for 9 to leave a safe margin, and always
// refetch on a 401/403 mid-life (rotated/expired token).
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000;

function cfg() {
  return {
    baseUrl: (process.env.SHIPROCKET_BASE_URL || "https://apiv2.shiprocket.in/v1/external").replace(/\/$/, ""),
    // .trim() every credential — a stray space/newline pasted into the Vercel
    // dashboard would otherwise silently 403 the auth-login call.
    email: (process.env.SHIPROCKET_EMAIL || "").trim(),
    password: (process.env.SHIPROCKET_PASSWORD || "").trim(),
    // The pickup address NICKNAME registered in Shiprocket (Settings -> Company ->
    // Pickup Addresses). Required by the create-order payload.
    pickupLocation: (process.env.SHIPROCKET_PICKUP_LOCATION || "").trim(),
    // Customer-facing tracking page. Shiprocket's public tracker is
    // shiprocket.co/tracking/<AWB>; a branded domain can override via env later.
    trackBase: (process.env.SHIPROCKET_TRACK_URL_BASE || "https://shiprocket.co/tracking").replace(/\/$/, ""),
    // Viora's standard jewellery package — FIXED (mirrors velocity.js). Height &
    // weight scale with quantity in buildOrderPayload; length & breadth are const.
    dims: {
      length: 18, // cm
      breadth: 12, // cm
      height: 4, // cm (per unit)
      weight: 0.2, // kg (per unit)
    },
    enabled: String(process.env.SHIPROCKET_ENABLED).trim().toLowerCase() === "true",
    mock: String(process.env.SHIPROCKET_MOCK).trim().toLowerCase() === "true",
  };
}

// ===========================================================================
// AUTH TOKEN (in-memory cache, refreshed on expiry or 401/403)
// ===========================================================================

let tokenCache = null; // { token, expiresAt }

/**
 * Return a valid auth token, using the cache while it's comfortably in-date.
 * `forceRefresh` bypasses the cache (used after a 401/403). Throws on failure.
 */
async function getToken(forceRefresh = false) {
  const c = cfg();
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  const res = await fetch(`${c.baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    const err = new Error(`shiprocket auth failed HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  tokenCache = { token: data.token, expiresAt: Date.now() + TOKEN_TTL_MS };
  console.log("[shiprocket] auth token refreshed.");
  return data.token;
}

// ===========================================================================
// CREATE ORDER  (adhoc)
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

/** Shiprocket wants a bare 10-digit Indian mobile — strip +91 / 91 / 0 prefixes. */
function tenDigitPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length > 10) return digits.slice(-10); // drop country code (e.g. 91)
  return digits;
}

/**
 * Map OUR normalized order -> Shiprocket's create/adhoc body.
 * @param {{orderId,orderGuid,name,phone,amount,paymentMode,product,address,items}} o
 */
function buildOrderPayload(o) {
  const c = cfg();
  const address = o.address || {};
  const isCOD = o.paymentMode !== "PREPAID";
  const amount = Number(o.amount) || 0;

  // Never let a non-product fee line (our COD "Delivery + COD Charges" SERVICE
  // line) reach the shipment — it would be counted as an extra unit and inflate
  // volumetric weight/height. Mirrors velocity.buildShipmentPayload.
  const isFeeItem = (it) => {
    const nm = String(it?.name || "").toLowerCase();
    return nm.includes("cod charge") || nm.includes("delivery + cod") || nm.includes("delivery and cod");
  };
  const productItems = Array.isArray(o.items) ? o.items.filter((it) => !isFeeItem(it)) : [];

  const items =
    productItems.length
      ? productItems.map((it, i) => ({
          name: it.name || o.product || "Jewellery",
          sku: it.sku || `SKU-${i + 1}`,
          units: Number(it.quantity) || 1,
          selling_price: Number(it.price) || amount || 0,
        }))
      : [{ name: o.product || "Jewellery", sku: "SKU-1", units: 1, selling_price: amount }];

  // Package dimensions scale with quantity (same rule as Velocity): the default
  // box holds ONE unit; each extra unit stacks on top, so only HEIGHT grows and
  // weight adds up per unit. e.g. qty 2 -> 18 x 12 x 8 cm, 0.4 kg.
  const totalUnits = items.reduce((sum, it) => sum + (Number(it.units) || 1), 0) || 1;

  // Split the customer name into first/last for Shiprocket's two fields.
  const fullName = (o.name || "Customer").trim();
  const sp = fullName.indexOf(" ");
  const firstName = sp === -1 ? fullName : fullName.slice(0, sp);
  const lastName = sp === -1 ? "" : fullName.slice(sp + 1);

  return {
    // order_id = "VJ-#<Wix number>" (same convention as Velocity) so the courier
    // dashboard id matches the Wix/site/email order and the status webhook (which
    // echoes it back as `order_id`) correlates via wix.findOrderByNumber, which
    // strips the "VJ-#" prefix. Falls back to the GUID if no number is available.
    order_id: o.orderId ? `VJ-#${o.orderId}` : o.orderGuid,
    order_date: formatOrderDate(new Date()),
    pickup_location: c.pickupLocation, // the registered pickup nickname
    billing_customer_name: firstName,
    billing_last_name: lastName,
    billing_address: address.line1 || "",
    billing_city: address.city || "",
    billing_pincode: address.postalCode || "",
    billing_state: address.state || "",
    billing_country: address.country || "India",
    billing_email: o.email || "",
    billing_phone: tenDigitPhone(o.phone),
    shipping_is_billing: true,
    order_items: items,
    payment_method: isCOD ? "COD" : "Prepaid",
    sub_total: amount,
    length: c.dims.length,
    breadth: c.dims.breadth,
    height: c.dims.height * totalUnits,
    weight: Number((c.dims.weight * totalUnits).toFixed(3)),
  };
}

/** POST an authenticated JSON request, refreshing the token once on 401/403. */
async function authedPost(path, body) {
  const c = cfg();
  const post = (token) =>
    fetch(`${c.baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  let token = await getToken();
  let res = await post(token);
  if (res.status === 401 || res.status === 403) {
    tokenCache = null;
    token = await getToken(true);
    res = await post(token);
  }
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/**
 * CREATE-ONLY: create an order WITHOUT assigning a courier/AWB (Shiprocket's
 * create/adhoc endpoint). Lands in "New Orders" with NO wallet deduction; the
 * operator picks a courier + ships it there later. Never throws.
 * Returns { ok, dryRun, courierOrderId, shipmentId, raw }.
 */
async function createOrderOnly(o) {
  const c = cfg();
  const body = buildOrderPayload(o);

  if (c.mock || !c.enabled) {
    console.log("[shiprocket] MOCK createOrderOnly (SHIPROCKET_MOCK/ENABLED gate) — no network.");
    console.log("[shiprocket] would POST /orders/create/adhoc:", JSON.stringify(body, null, 2));
    return {
      ok: true,
      dryRun: true,
      courierOrderId: `MOCK-ORD-${o.orderId}`,
      shipmentId: `MOCK-SHIP-${o.orderId}`,
      raw: { mock: true },
    };
  }

  if (!c.baseUrl || !c.email || !c.password || !c.pickupLocation) {
    console.error("[shiprocket] SHIPROCKET_EMAIL / PASSWORD / PICKUP_LOCATION not fully set.");
    return { ok: false, dryRun: false, error: "shiprocket not configured" };
  }

  try {
    return await withRetry(
      async () => {
        const { res, data } = await authedPost("/orders/create/adhoc", body);
        if (!res.ok) {
          const err = new Error(`shiprocket create-order failed HTTP ${res.status}`);
          err.status = res.status;
          err.data = data;
          throw err; // withRetry: 5xx/429 retried, 4xx not
        }
        // Success contract: a shipment_id (and order_id) come back. awb_code is
        // intentionally absent here — no courier assigned yet.
        if (!data?.shipment_id) {
          console.error("[shiprocket] create-order returned no shipment_id:", JSON.stringify(data).slice(0, 400));
          return {
            ok: false,
            dryRun: false,
            error: data?.message || firstError(data) || "shiprocket create failed",
            raw: data,
          };
        }
        return {
          ok: true,
          dryRun: false,
          courierOrderId: data.order_id || null,
          shipmentId: data.shipment_id || null,
          raw: data,
        };
      },
      { label: "shiprocket.createOrderOnly", retries: 3 }
    );
  } catch (err) {
    console.error("[shiprocket] createOrderOnly failed:", err?.message || err);
    return { ok: false, dryRun: false, error: err?.message || String(err), data: err?.data };
  }
}

/**
 * Create the order AND assign an AWB so a shipping label exists now. Two steps:
 *   1) create/adhoc  -> shipment_id
 *   2) courier/assign/awb {shipment_id}  -> AWB (auto-picks cheapest serviceable
 *      courier unless `courierId` is given).
 * Never throws. Returns { ok, dryRun, awb, courierName, trackingUrl, shipmentId, raw }.
 */
async function createShipment(o, courierId) {
  const c = cfg();

  if (c.mock || !c.enabled) {
    const awb = `MOCK-${o.orderId}`;
    console.log(`[shiprocket] MOCK createShipment (SHIPROCKET_MOCK/ENABLED gate) -> awb=${awb}`);
    return { ok: true, dryRun: true, awb, trackingUrl: `${c.trackBase}/${awb}`, raw: { mock: true } };
  }

  // Step 1: create the order.
  const created = await createOrderOnly(o);
  if (!created.ok) return created;

  // Step 2: assign an AWB to that shipment.
  try {
    const assign = await withRetry(
      async () => {
        const body = courierId ? { shipment_id: created.shipmentId, courier_id: courierId } : { shipment_id: created.shipmentId };
        const { res, data } = await authedPost("/courier/assign/awb", body);
        if (!res.ok) {
          const err = new Error(`shiprocket assign-awb failed HTTP ${res.status}`);
          err.status = res.status;
          err.data = data;
          throw err;
        }
        const d = data?.response?.data || {};
        const awb = d.awb_code || data?.awb_code || null;
        if (!awb) {
          return {
            ok: false,
            dryRun: false,
            error: data?.message || firstError(data) || "shiprocket assigned no AWB (no serviceable courier?)",
            raw: data,
            shipmentId: created.shipmentId,
          };
        }
        return {
          ok: true,
          dryRun: false,
          awb,
          courierName: d.courier_name || null,
          courierId: d.courier_company_id || null,
          trackingUrl: `${c.trackBase}/${awb}`,
          shipmentId: created.shipmentId,
          courierOrderId: created.courierOrderId,
          raw: data,
        };
      },
      { label: "shiprocket.assignAwb", retries: 2 }
    );
    return assign;
  } catch (err) {
    console.error("[shiprocket] assignAwb failed:", err?.message || err);
    // The order WAS created — surface that so the caller can still record it.
    return {
      ok: false,
      dryRun: false,
      error: err?.message || String(err),
      data: err?.data,
      shipmentId: created.shipmentId,
      courierOrderId: created.courierOrderId,
    };
  }
}

/** Pull the first human-readable message out of Shiprocket's `errors` object. */
function firstError(data) {
  const e = data?.errors;
  if (!e) return null;
  if (typeof e === "string") return e;
  const firstKey = Object.keys(e)[0];
  if (!firstKey) return null;
  const v = e[firstKey];
  return Array.isArray(v) ? v[0] : String(v);
}

// ===========================================================================
// STATUS WEBHOOK  (WF2/WF3)
// ===========================================================================

/**
 * Map a raw Shiprocket status string to our internal status enum. Same mapping
 * as velocity.normalizeStatus — Shiprocket phrases are a superset that this
 * already covers ("RTO INITIATED", "OUT FOR DELIVERY", "PICKED UP", …).
 * @returns {"DISPATCHED"|"OUT_FOR_DELIVERY"|"DELIVERED"|"RTO"|"CANCELLED"|"OTHER"}
 */
function normalizeStatus(raw) {
  const s = String(raw || "").toUpperCase().replace(/[\s-]+/g, "_");
  if (s.startsWith("RTO") || s.startsWith("RETURN")) return "RTO";
  if (["OUT_FOR_DELIVERY", "OFD", "OUT_FOR_DELIVER"].includes(s)) return "OUT_FOR_DELIVERY";
  if (["DELIVERED", "DELIVER", "COMPLETED"].includes(s)) return "DELIVERED";
  if (
    [
      "IN_TRANSIT", "INTRANSIT", "TRANSIT",
      "SHIPPED", "DISPATCHED", "DISPATCH",
      "PICKED_UP", "PICKUP", "PICKUP_DONE", "PICKUP_COMPLETE", "PICKUP_COMPLETED",
      "PICKUP_SCHEDULED", "PICKUP_GENERATED", "OUT_FOR_PICKUP",
      "SHIPMENT_PICKED_UP", "MANIFESTED", "IN_TRANSIT_",
    ].includes(s)
  ) {
    return "DISPATCHED";
  }
  if (["CANCELLED", "CANCELED", "CANCEL"].includes(s)) return "CANCELLED";
  return "OTHER";
}

/**
 * Pull { reference, awb, status } out of a Shiprocket status webhook body.
 * Shiprocket echoes the channel `order_id` we sent at creation ("VJ-#10312") and
 * the AWB in `awb`; `current_status` (or `shipment_status`) is the state string.
 */
function parseStatusWebhook(body) {
  const b = body || {};
  const data = b.data || b;
  return {
    reference: data.order_id || data.channel_order_id || data.sr_order_id || null,
    awb: data.awb || data.awb_code || null,
    trackingUrl: data.tracking_url || data.track_url || null,
    rawStatus: data.current_status || data.shipment_status || data.status || null,
    status: normalizeStatus(data.current_status || data.shipment_status || data.status),
  };
}

/**
 * Live tracking for the storefront timeline. GET /courier/track/awb/{awb} ->
 * current shipment_status + activity list. Never throws.
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
        const get = (token) =>
          fetch(`${c.baseUrl}/courier/track/awb/${encodeURIComponent(awb)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        let token = await getToken();
        let res = await get(token);
        if (res.status === 401 || res.status === 403) {
          tokenCache = null;
          token = await getToken(true);
          res = await get(token);
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const e = new Error(`shiprocket track failed HTTP ${res.status}`);
          e.status = res.status;
          throw e;
        }
        const rec = data?.tracking_data || {};
        return {
          ok: true,
          dryRun: false,
          status: rec.shipment_status || rec.shipment_track?.[0]?.current_status || null,
          activities: rec.shipment_track_activities || [],
          trackUrl: rec.track_url || `${c.trackBase}/${awb}`,
          raw: data,
        };
      },
      { label: "shiprocket.trackShipment", retries: 2 }
    );
  } catch (err) {
    console.error("[shiprocket] trackShipment failed:", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Verify a Shiprocket webhook is genuine. Shiprocket sends the token you set in
 * its webhook config as the `x-api-key` header. If SHIPROCKET_WEBHOOK_SECRET is
 * set, require a match; otherwise allow (scaffold, until the secret is set).
 */
function verifyWebhook(secretHeader) {
  const secret = process.env.SHIPROCKET_WEBHOOK_SECRET;
  if (!secret) return true; // check disabled until a secret is configured
  return secretHeader === secret;
}

export {
  createOrderOnly,
  createShipment,
  buildOrderPayload,
  getToken,
  trackShipment,
  normalizeStatus,
  parseStatusWebhook,
  verifyWebhook,
};
