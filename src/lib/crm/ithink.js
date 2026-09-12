// Single place that talks to the iThink Logistics shipping API (v2).
//
// Deliberately mirrors lib/crm/shiprocket.js / velocity.js so the three couriers
// are interchangeable behind the dashboard picker / assign-courier route:
//   - createShipment(o)   -> create the order AND generate a waybill (AWB) in one
//                            call (iThink's order/add.json does both — there is no
//                            "New Orders without AWB" state like Shiprocket's, so
//                            createOrderOnly delegates here for interface parity).
//   - createOrderOnly(o)  -> alias of createShipment (see above).
//   - trackShipment(awb)  -> live tracking for the storefront timeline.
//   - parseStatusWebhook  -> map iThink's status webhook to our internal enum.
//
// iThink v2 auth is NOT a JWT: every request carries `access_token` + `secret_key`
// INSIDE the JSON body's `data` object (no login/token endpoint). Base host is
// https://api.ithinklogistics.com/api_v2 (override via ITHINK_BASE_URL).
//
// Docs: https://docs.ithinklogistics.com/doc-add-order/2  (add order)
//       https://docs.ithinklogistics.com/doc-track-order/2 (track order)
//
// Two safety gates mirror shiprocket.js so nothing hits the real carrier or the
// iThink wallet by accident:
//   ITHINK_MOCK=true     -> never call the network; return a fake AWB so the whole
//                           Wix -> iThink -> WhatsApp pipeline runs end-to-end dry.
//   ITHINK_ENABLED=false -> even if not mocking, treat as dry-run.

import { withRetry } from "./reliability";

function cfg() {
  return {
    baseUrl: (process.env.ITHINK_BASE_URL || "https://api.ithinklogistics.com/api_v2").replace(/\/$/, ""),
    // .trim() every credential — a stray space/newline pasted into the Vercel
    // dashboard would otherwise silently fail auth.
    accessToken: (process.env.ITHINK_ACCESS_TOKEN || "").trim(),
    secretKey: (process.env.ITHINK_SECRET_KEY || "").trim(),
    // Numeric IDs from the iThink panel (Settings -> Pickup / Return Addresses).
    // Required by add.json. Return defaults to the pickup id when unset.
    pickupAddressId: (process.env.ITHINK_PICKUP_ADDRESS_ID || "").trim(),
    returnAddressId: (process.env.ITHINK_RETURN_ADDRESS_ID || process.env.ITHINK_PICKUP_ADDRESS_ID || "").trim(),
    // Which carrier + service iThink should book through. add.json requires a
    // logistics partner; auto-cheapest can be added later via iThink's rate API.
    logistics: (process.env.ITHINK_LOGISTICS || "").trim(),
    serviceType: (process.env.ITHINK_SERVICE_TYPE || "ground").trim(),
    // Customer-facing tracking page. Set a branded URL later (as we did for
    // Velocity); default to iThink's public tracker.
    trackBase: (process.env.ITHINK_TRACK_URL_BASE || "https://ithinklogistics.com/track").replace(/\/$/, ""),
    // Viora's standard jewellery package — FIXED (mirrors shiprocket/velocity).
    // Height & weight scale with quantity; length & breadth are const.
    dims: {
      length: 18, // cm
      breadth: 12, // cm
      height: 4, // cm (per unit)
      weight: 0.2, // kg (per unit)
    },
    enabled: String(process.env.ITHINK_ENABLED).trim().toLowerCase() === "true",
    mock: String(process.env.ITHINK_MOCK).trim().toLowerCase() === "true",
  };
}

// ===========================================================================
// PAYLOAD BUILDER
// ===========================================================================

/** Format a date as "DD-MM-YYYY" in IST, regardless of server timezone. */
function formatOrderDate(d) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")}`;
}

/** iThink wants a bare 10-digit Indian mobile — strip +91 / 91 / 0 prefixes. */
function tenDigitPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length > 10) return digits.slice(-10); // drop country code (e.g. 91)
  return digits;
}

/**
 * Map OUR normalized order -> iThink's add.json `data` body.
 * @param {{orderId,orderGuid,name,phone,email,amount,paymentMode,product,address,items}} o
 */
function buildOrderPayload(o) {
  const c = cfg();
  const address = o.address || {};
  const isCOD = o.paymentMode !== "PREPAID";
  const amount = Number(o.amount) || 0;

  // Never let a non-product fee line (our COD "Delivery + COD Charges" SERVICE
  // line) reach the shipment — it would be counted as an extra unit and inflate
  // volumetric weight/height. Mirrors shiprocket/velocity.
  const isFeeItem = (it) => {
    const nm = String(it?.name || "").toLowerCase();
    return nm.includes("cod charge") || nm.includes("delivery + cod") || nm.includes("delivery and cod");
  };
  const productItems = Array.isArray(o.items) ? o.items.filter((it) => !isFeeItem(it)) : [];

  // iThink add.json takes ONE product summary per shipment (products / _sku /
  // _quantity / _price). Collapse our line items into a single representative
  // product + total quantity so the box + weight math still scales.
  const firstItem = productItems[0] || null;
  const totalUnits =
    (productItems.length
      ? productItems.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0)
      : 1) || 1;
  const productName = firstItem?.name || o.product || "Jewellery";
  const productSku = firstItem?.sku || "SKU-1";
  const productPrice = Number(firstItem?.price) || amount || 0;

  // order = "VJ-#<Wix number>" (same convention as Velocity/Shiprocket) so the
  // courier dashboard id matches the Wix/site/email order and the status webhook
  // correlates via wix.findOrderByNumber (which strips the "VJ-#" prefix). Falls
  // back to the GUID if no number is available.
  const orderRef = o.orderId ? `VJ-#${o.orderId}` : o.orderGuid;

  const shipment = {
    waybill: "", // blank -> iThink auto-generates the AWB
    order: orderRef,
    sub_order: "",
    order_date: formatOrderDate(new Date()),
    total_amount: String(amount),
    name: (o.name || "Customer").trim(),
    add: address.line1 || "",
    add2: address.line2 || "",
    add3: "",
    pin: address.postalCode || "",
    city: address.city || "",
    state: address.state || "",
    country: address.country || "India",
    phone: tenDigitPhone(o.phone),
    alt_phone: "",
    email: o.email || "",
    is_billing_same_as_shipping: "yes",
    billing_name: "",
    billing_add: "",
    billing_pin: "",
    billing_phone: "",
    products: productName,
    products_desc: productName,
    product_sku: productSku,
    product_quantity: String(totalUnits),
    product_price: String(productPrice),
    product_tax_rate: "",
    product_hsn_code: "",
    product_discount: "",
    shipment_length: String(c.dims.length),
    shipment_width: String(c.dims.breadth),
    shipment_height: String(c.dims.height * totalUnits),
    weight: String(Number((c.dims.weight * totalUnits).toFixed(3))),
    shipping_charges: "",
    giftwrap_charges: "",
    transaction_charges: "",
    total_discount: "",
    // COD collects the order total; Prepaid collects nothing.
    cod_amount: isCOD ? String(amount) : "0",
    payment_mode: isCOD ? "COD" : "Prepaid",
    cod_charges: "",
    advance_amount: "",
    return_address_id: c.returnAddressId,
  };

  return {
    data: {
      shipments: [shipment],
      pickup_address_id: c.pickupAddressId,
      access_token: c.accessToken,
      secret_key: c.secretKey,
      logistics: c.logistics,
      s_type: c.serviceType,
      order_type: "",
    },
  };
}

// ===========================================================================
// CREATE SHIPMENT  (add.json -> order + AWB in one call)
// ===========================================================================

/** POST a JSON body to an iThink endpoint. Returns { res, data }. */
async function post(path, body) {
  const c = cfg();
  const res = await fetch(`${c.baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/**
 * Pull the per-shipment result out of iThink's add.json response. The success
 * body keys each shipment by index ("1", "2", …); we sent one, so read the
 * first value. Returns { ok, waybill, refnum, remark, raw }.
 */
function readAddResult(data) {
  const shipments = data?.data && typeof data.data === "object" ? Object.values(data.data) : [];
  const first = shipments[0] || null;
  const okStatus = String(first?.status || "").toLowerCase() === "success";
  return {
    ok: Boolean(okStatus && first?.waybill),
    waybill: first?.waybill ? String(first.waybill) : null,
    refnum: first?.refnum || null,
    remark: first?.remark || data?.message || null,
    raw: data,
  };
}

/**
 * Create the order AND generate its AWB (iThink order/add.json). Never throws.
 * Returns { ok, dryRun, awb, courierName, trackingUrl, courierOrderId, raw }.
 */
async function createShipment(o) {
  const c = cfg();
  const body = buildOrderPayload(o);

  if (c.mock || !c.enabled) {
    const awb = `MOCK-IT-${o.orderId}`;
    console.log(`[ithink] MOCK createShipment (ITHINK_MOCK/ENABLED gate) -> awb=${awb}`);
    console.log("[ithink] would POST /order/add.json:", JSON.stringify(body, null, 2));
    return { ok: true, dryRun: true, awb, trackingUrl: `${c.trackBase}/${awb}`, raw: { mock: true } };
  }

  if (!c.accessToken || !c.secretKey || !c.pickupAddressId || !c.logistics) {
    console.error("[ithink] ITHINK_ACCESS_TOKEN / SECRET_KEY / PICKUP_ADDRESS_ID / LOGISTICS not fully set.");
    return { ok: false, dryRun: false, error: "ithink not configured" };
  }

  try {
    return await withRetry(
      async () => {
        const { res, data } = await post("/order/add.json", body);
        if (!res.ok) {
          const err = new Error(`ithink add-order failed HTTP ${res.status}`);
          err.status = res.status;
          err.data = data;
          throw err; // withRetry: 5xx/429 retried, 4xx not
        }
        const result = readAddResult(data);
        if (!result.ok) {
          console.error("[ithink] add-order returned no waybill:", JSON.stringify(data).slice(0, 400));
          return {
            ok: false,
            dryRun: false,
            error: result.remark || "ithink created no AWB (unserviceable pincode / no wallet balance?)",
            raw: data,
          };
        }
        return {
          ok: true,
          dryRun: false,
          awb: result.waybill,
          courierName: c.logistics,
          courierOrderId: result.refnum,
          trackingUrl: `${c.trackBase}/${result.waybill}`,
          raw: data,
        };
      },
      { label: "ithink.createShipment", retries: 3 }
    );
  } catch (err) {
    console.error("[ithink] createShipment failed:", err?.message || err);
    return { ok: false, dryRun: false, error: err?.message || String(err), data: err?.data };
  }
}

/**
 * Interface parity with velocity/shiprocket. iThink's add.json always generates
 * an AWB (there is no create-without-AWB state), so this is an alias.
 */
async function createOrderOnly(o) {
  return createShipment(o);
}

// ===========================================================================
// STATUS MAPPING + WEBHOOK
// ===========================================================================

/**
 * Map a raw iThink status string to our internal enum. Covers iThink's phrases
 * ("Reached At Destination", "RTO In Transit", "Undelivered", "Not Picked", …).
 * @returns {"DISPATCHED"|"OUT_FOR_DELIVERY"|"DELIVERED"|"UNDELIVERED"|"RTO"|"CANCELLED"|"OTHER"}
 */
function normalizeStatus(raw) {
  const s = String(raw || "").toUpperCase().replace(/[\s-]+/g, "_");
  if (s.startsWith("RTO") || s.startsWith("RETURN")) return "RTO";
  // Failed delivery attempt (NDR) — matched before OUT_FOR_DELIVERY/DELIVERED so a
  // failed scan is never read as a success.
  if (
    s.includes("NDR") ||
    s.includes("UNDELIVER") ||
    s === "NOT_DELIVERED" ||
    s.includes("OUT_OF_DELIVERY_AREA") ||
    (s.includes("DELIVER") && (s.includes("FAIL") || s.includes("ATTEMPT")))
  )
    return "UNDELIVERED";
  if (["OUT_FOR_DELIVERY", "OFD"].includes(s)) return "OUT_FOR_DELIVERY";
  if (["DELIVERED", "DELIVER", "COMPLETED"].includes(s)) return "DELIVERED";
  if (
    [
      "IN_TRANSIT", "INTRANSIT", "TRANSIT",
      "SHIPPED", "DISPATCHED", "DISPATCH",
      "PICKED_UP", "PICKUP", "PICKUP_DONE",
      "MANIFESTED", "REACHED_AT_DESTINATION",
    ].includes(s)
  ) {
    return "DISPATCHED";
  }
  if (["CANCELLED", "CANCELED", "CANCEL"].includes(s)) return "CANCELLED";
  return "OTHER";
}

/**
 * Pull { references[], awb, status } out of an iThink status webhook body.
 * iThink's "Push Order Statuses" payload field names vary, so we read defensively
 * from the common candidates (waybill/awb + our "VJ-#<number>" order ref). The
 * caller tries each reference against Wix (findOrderByNumber strips "VJ-#"), then
 * the AWB. Refine once a real iThink webhook sample is captured.
 */
function parseStatusWebhook(body) {
  const b = body || {};
  const data = b.data || b;
  const clean = (v) => {
    const s = v == null ? "" : String(v).trim();
    return !s || /^enter your/i.test(s) ? "" : s;
  };
  const references = [
    clean(data.order || data.order_id || data.reference), // our "VJ-#<number>" (preferred)
    clean(data.refnum),
    clean(data.crm_order_id),
  ].filter(Boolean);
  const awb = data.awb_no || data.waybill || data.awb || data.awb_number;
  const rawStatus =
    data.current_status || data.status || data.shipment_status || data.latest_status || null;
  return {
    references,
    reference: references[0] || null,
    awb: awb != null && awb !== "" ? String(awb) : null,
    trackingUrl: data.tracking_url || data.track_url || null,
    attempt:
      data.attempt ?? data.attempts ?? data.ndr_attempt ?? data.no_of_attempts ?? null,
    rawStatus,
    status: normalizeStatus(rawStatus),
  };
}

// ===========================================================================
// TRACKING  (order/track.json)
// ===========================================================================

/**
 * Live tracking for the storefront timeline. POST /order/track.json ->
 * current_status + scan_details for the AWB. Never throws.
 * @returns {Promise<{ok:boolean, status?:string, activities?:any[], trackUrl?:string, error?:any}>}
 */
async function trackShipment(awb) {
  const c = cfg();
  if (c.mock || !c.enabled) {
    return { ok: true, dryRun: true, status: "In Transit", activities: [], trackUrl: `${c.trackBase}/${awb}` };
  }
  if (!awb) return { ok: false, error: "no awb" };
  if (!c.accessToken || !c.secretKey) return { ok: false, error: "ithink not configured" };

  try {
    return await withRetry(
      async () => {
        const { res, data } = await post("/order/track.json", {
          data: { awb_number_list: String(awb), access_token: c.accessToken, secret_key: c.secretKey },
        });
        if (!res.ok) {
          const e = new Error(`ithink track failed HTTP ${res.status}`);
          e.status = res.status;
          throw e;
        }
        const rec = data?.data?.[String(awb)] || {};
        return {
          ok: true,
          dryRun: false,
          status: rec.current_status || rec.last_scan_details?.status || null,
          activities: rec.scan_details || [],
          trackUrl: `${c.trackBase}/${awb}`,
          raw: data,
        };
      },
      { label: "ithink.trackShipment", retries: 2 }
    );
  } catch (err) {
    console.error("[ithink] trackShipment failed:", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Verify an iThink webhook is genuine. If ITHINK_WEBHOOK_SECRET is set, require
 * the shared token in the `x-api-key` header to match; otherwise allow (scaffold,
 * until the secret is configured in iThink's webhook settings).
 */
function verifyWebhook(secretHeader) {
  const secret = process.env.ITHINK_WEBHOOK_SECRET;
  if (!secret) return true; // check disabled until a secret is configured
  return secretHeader === secret;
}

export {
  createOrderOnly,
  createShipment,
  buildOrderPayload,
  trackShipment,
  normalizeStatus,
  parseStatusWebhook,
  verifyWebhook,
};
