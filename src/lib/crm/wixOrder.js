// Extracts the bits we care about (phone, order id, name) from a Wix webhook
// body, and normalises the phone into WhatsApp's required format.
//
// Wix can deliver order/lead data in several shapes depending on how you set it
// up (native eCommerce "Order Created" webhook vs. a Wix Automation "call a
// webhook" step with a custom payload). Rather than hard-code one path, we look
// through the common locations defensively. Pure functions — no I/O — so they
// can be tested against sample payloads.

/**
 * Turn whatever Wix gives us into digits-only international format for WhatsApp.
 * If the number has no country code, prepend defaultCountryCode.
 * Returns null if there aren't enough digits to be a real number.
 */
function normalizePhone(raw, defaultCountryCode = "91") {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d]/g, ""); // strip +, spaces, dashes
  if (!digits) return null;

  // Strip a leading 00 international prefix (e.g. 0091… -> 91…).
  if (digits.startsWith("00")) digits = digits.slice(2);

  // A bare 10-digit number (typical Indian mobile) has no country code — add it.
  // (Once a country code is present the length is >= 11, so we leave it alone.)
  if (digits.length === 10) digits = `${defaultCountryCode}${digits}`;

  // Strip a domestic trunk "0" that sometimes precedes the country code path,
  // e.g. "091..." -> "91...". Only when it clearly isn't part of the number.
  if (digits.length > 11 && digits.startsWith("0")) digits = digits.replace(/^0+/, "");

  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

/**
 * Walk an object graph (bounded depth, cycle-safe) and return the first value
 * `predicate` yields non-undefined for. Used as a LAST-RESORT fallback: a Wix
 * Automation "Send via webhook" action can nest the order under keys we don't
 * anticipate (or wrap it in a custom shape), so rather than enumerate every
 * possible path we locate the signal (a priceSummary/total, a lineItems array,
 * a paymentStatus) wherever it actually lives in the payload.
 */
function deepFind(obj, predicate, maxDepth = 6) {
  const seen = new Set();
  const walk = (node, depth) => {
    if (node == null || typeof node !== "object" || depth > maxDepth || seen.has(node)) return undefined;
    seen.add(node);
    const hit = predicate(node);
    if (hit !== undefined) return hit;
    for (const key of Object.keys(node)) {
      const r = walk(node[key], depth + 1);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  return walk(obj, 0);
}

/**
 * Read the scalar out of a Wix money object. Wix eCom uses `{ value, currency }`
 * (e.g. priceSummary.total.value = "579.00"); older/other shapes use `amount` or
 * `formattedAmount`. Accepts a plain number/string too.
 */
function moneyValue(m) {
  if (m == null) return undefined;
  if (typeof m === "object") return firstDefined(m.value, m.amount, m.formattedAmount);
  return m;
}

/** Normalize a Wix media reference to a public https image URL (or undefined). */
function toWixImageUrl(raw) {
  if (!raw || typeof raw !== "string") return undefined;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("wix:image://")) {
    const m = raw.match(/^wix:image:\/\/v1\/([^/#?]+)/);
    if (m) return `https://static.wixstatic.com/media/${m[1]}`;
  }
  return undefined;
}

/** Deep fallback: the value of any `priceSummary.total` / `total` money object. */
const deepFindAmount = (root) =>
  deepFind(root, (n) => {
    const t = n.priceSummary?.total ?? (n.total && typeof n.total === "object" ? n.total : undefined);
    return t ? moneyValue(t) : undefined;
  });

/** Deep fallback: the first non-empty lineItems/items array in the payload. */
const deepFindItems = (root) =>
  deepFind(root, (n) => {
    if (Array.isArray(n.lineItems) && n.lineItems.length) return n.lineItems;
    if (Array.isArray(n.items) && n.items.length) return n.items;
    return undefined;
  });

/**
 * Normalise Wix's many payment representations into our two-value enum.
 * Wix eCommerce exposes paymentStatus ("PAID" / "NOT_PAID" / "PARTIALLY_PAID")
 * and sometimes an explicit method. We treat a fully-paid order as PREPAID and
 * everything else as COD (cash collected on delivery).
 */
function normalizePaymentMode(order = {}, body = {}) {
  const explicit = firstDefined(
    body.paymentMode,
    order.paymentMode,
    order.paymentMethod,
    deepFind(body, (n) => firstDefined(n.paymentMode, n.paymentMethod))
  );
  if (explicit) {
    const s = String(explicit).toUpperCase();
    if (s.includes("PREPAID") || s.includes("ONLINE") || s.includes("CARD") || s.includes("RAZORPAY"))
      return "PREPAID";
    if (s.includes("COD") || s.includes("CASH")) return "COD";
  }
  const status = String(
    firstDefined(
      order.paymentStatus,
      order.billingInfo?.paymentStatus,
      body.paymentStatus,
      deepFind(body, (n) => (typeof n.paymentStatus === "string" ? n.paymentStatus : undefined))
    ) || ""
  ).toUpperCase();
  return status === "PAID" || status === "FULLY_PAID" ? "PREPAID" : "COD";
}

/** Pull a display total from the several places Wix may put it. */
function extractAmount(order = {}, body = {}) {
  const raw = firstDefined(
    moneyValue(order.priceSummary?.total), // Wix eCom: { value, currency }
    moneyValue(order.totals?.total),
    moneyValue(order.balanceSummary?.balance),
    moneyValue(order.total),
    body.amount,
    body.total,
    // Last resort: find a total anywhere in the payload (unknown nesting).
    deepFindAmount(body)
  );
  if (raw == null) return undefined;
  // Strip any currency symbol/commas Wix may have formatted in.
  const cleaned = String(raw).replace(/[^\d.]/g, "");
  return cleaned || undefined;
}

/**
 * Normalize the order's line items into a structured list our pipeline can use
 * everywhere (WhatsApp product name/photo, Velocity order_items). Handles the
 * Wix eCom "order_placed" automation shape (itemName, sku, catalogItemId, image,
 * totalPrice{value}) as well as older productName{original} shapes.
 *
 * @returns {{name,sku,quantity,productId,image,price}[]}
 */
function extractItems(order = {}, body = {}) {
  const raw = order.lineItems || order.items || body.lineItems || deepFindItems(body) || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((li) => ({
    name:
      li?.itemName || // Wix eCom order_placed automation payload
      li?.productName?.original ||
      li?.productName?.translated ||
      li?.productName ||
      li?.name ||
      li?.catalogReference?.productName ||
      li?.title ||
      "Item",
    sku:
      li?.sku ||
      li?.physicalProperties?.sku ||
      li?.catalogReference?.options?.sku ||
      undefined,
    quantity: Number(li?.quantity) || 1,
    productId:
      li?.catalogItemId ||
      li?.rootCatalogItemId ||
      li?.catalogReference?.catalogItemId ||
      li?.productId ||
      undefined,
    image: toWixImageUrl(li?.image || li?.mediaItem?.url || li?.catalogReference?.options?.image),
    price: moneyValue(li?.totalPrice) || moneyValue(li?.price) || undefined,
  }));
}

/** First line-item name, with "(+N more)" when the order has several items. */
function extractProduct(order = {}, body = {}) {
  const items = extractItems(order, body);
  if (items.length > 0) {
    const first = items[0].name;
    return items.length > 1 ? `${first} (+${items.length - 1} more)` : String(first);
  }
  return firstDefined(body.product, body.productName);
}

/**
 * Pull the shipping/billing address out of the Wix order, defensively across the
 * shapes Wix uses (native eCom order vs. Automation payload). Prefers the
 * shipping destination (where the parcel goes), then billing. Returns a
 * normalized { line1, city, state, postalCode, country } — any field may be "".
 */
function extractAddress(order = {}, body = {}) {
  const a =
    order.shippingInfo?.logistics?.shippingDestination?.address || // Wix eCom order_placed
    order.shippingInfo?.shippingDestination?.address ||
    order.recipientInfo?.address ||
    order.billingInfo?.address ||
    body.address ||
    {};
  const line1 = firstDefined(
    a.addressLine1,
    a.addressLine,
    a.addressLine1WithComment,
    [a.streetAddress?.number, a.streetAddress?.name].filter(Boolean).join(" ") || undefined,
    a.formattedAddress
  );
  return {
    line1: line1 || "",
    city: firstDefined(a.city, a.cityName) || "",
    // Wix uses ISO subdivision codes like "IN-DL"; strip the country prefix so
    // Velocity gets a plain state name/code.
    state: String(firstDefined(a.subdivisionFullname, a.subdivision, a.state) || "").replace(
      /^IN-/i,
      ""
    ),
    postalCode: firstDefined(a.postalCode, a.zipCode, a.zip) || "",
    // Prefer the full country name ("India") over the ISO code ("IN").
    country: firstDefined(a.countryFullname, a.country) || "India",
  };
}

/**
 * Pull { eventType, orderId, phone, customerName } out of a Wix webhook body.
 * Any field may come back undefined if it isn't present in the payload.
 *
 * @param {object} body           parsed JSON request body from Wix
 * @param {string} defaultCountryCode
 */
function extractOrderInfo(body, defaultCountryCode = "91") {
  const b = body || {};
  // The actual order object may be at the root, or nested under common keys.
  const order = b.order || b.data?.order || b.entity || b.data || b;
  const contact = b.contact || b.data?.contact || order.buyerInfo || {};

  const eventType =
    firstDefined(b.eventType, b.slug, b.type, b.trigger, order._id ? "order" : undefined) ||
    "unknown";

  const orderId = firstDefined(
    order.number,
    order.orderNumber,
    order._id,
    order.id,
    b.orderId,
    b.orderNumber
  );

  const rawPhone = firstDefined(
    order.buyerInfo?.phone,
    order.billingInfo?.contactDetails?.phone,
    order.billingInfo?.address?.phone,
    order.recipientInfo?.contactDetails?.phone,
    order.shippingInfo?.logistics?.shippingDestination?.contactDetails?.phone,
    order.shippingInfo?.shippingDestination?.contactDetails?.phone,
    contact.phone,
    contact.phones?.[0]?.phone,
    b.phone
  );

  const customerName = firstDefined(
    [order.billingInfo?.contactDetails?.firstName, order.billingInfo?.contactDetails?.lastName]
      .filter(Boolean)
      .join(" ") || undefined,
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") || undefined,
    contact.name,
    b.customerName,
    "Customer"
  );

  const items = extractItems(order, b);
  const first = items[0] || {};
  const product = items.length
    ? items.length > 1
      ? `${first.name} (+${items.length - 1} more)`
      : first.name
    : firstDefined(b.product, b.productName);

  return {
    eventType,
    orderId: orderId != null ? String(orderId) : undefined,
    // The Wix order GUID (order.id) — needed to write tracking back to the real
    // Wix order later (pushTracking), distinct from the human order number above.
    orderGuid: firstDefined(order._id, order.id) || undefined,
    phone: normalizePhone(rawPhone, defaultCountryCode),
    rawPhone: rawPhone || undefined,
    customerName,
    email: firstDefined(order.buyerEmail, contact.email, order.billingInfo?.contactDetails?.email) || undefined,
    amount: extractAmount(order, b),
    paymentMode: normalizePaymentMode(order, b),
    product,
    productId: first.productId,
    productImage: first.image,
    sku: first.sku,
    items,
    address: extractAddress(order, b),
  };
}

/**
 * Pull { phone, customerName, product, value, cartToken, cartUrl } out of a Wix
 * "Abandoned Checkout" webhook body. Defensive across the shapes Wix uses.
 */
function extractAbandonedInfo(body, defaultCountryCode = "91") {
  const b = body || {};
  const co = b.abandonedCheckout || b.checkout || b.data?.checkout || b.data || b;
  const contact = co.buyerInfo || co.contactDetails || b.contact || {};

  const rawPhone = firstDefined(
    contact.phone,
    co.buyerInfo?.phone,
    co.billingInfo?.contactDetails?.phone,
    contact.phones?.[0]?.phone,
    b.phone
  );

  const customerName =
    firstDefined(
      [contact.firstName, contact.lastName].filter(Boolean).join(" ") || undefined,
      contact.name,
      co.buyerInfo?.firstName,
      b.customerName
    ) || "there";

  const value = extractAmount(co, b);
  const product = extractProduct(co, b);

  // Wix exposes a one-click recovery link under various names; the button {{1}}
  // suffix can be the whole URL or just a token, depending on your template.
  const cartUrl = firstDefined(
    co.checkoutUrl,
    co.abandonedCheckoutUrl,
    co.recoverUrl,
    co.recoveryUrl,
    b.cartUrl,
    b.recoverUrl
  );
  const cartToken = firstDefined(co._id, co.checkoutId, co.id, b.cartToken);

  return {
    phone: normalizePhone(rawPhone, defaultCountryCode),
    rawPhone: rawPhone || undefined,
    customerName,
    product,
    value,
    cartUrl: cartUrl || undefined,
    cartToken: cartToken != null ? String(cartToken) : undefined,
  };
}

export {
  extractOrderInfo,
  extractAbandonedInfo,
  extractAddress,
  extractItems,
  normalizePhone,
  normalizePaymentMode,
  moneyValue,
  toWixImageUrl,
};
