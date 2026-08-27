// Per-order PRODUCT OVERRIDE store (KV-backed).
//
// WHY THIS EXISTS: when a customer changes the colour/variant AFTER ordering,
// the operator edits the item in the Velocity dashboard — but the Wix order
// (which every post-order status WhatsApp message reads its product NAME and
// PHOTO from) still holds the ORIGINAL item. So the dispatched / out-for-
// delivery / delivered / cancelled messages would show the OLD colour. This
// store lets the operator record the corrected product (name + photo) for one
// order; the status pipeline applies it just before sending, so the customer
// sees the right colour.
//
// Transport: Upstash Redis REST (same as idempotency.js) — plain fetch, no SDK.
// Keyed by the HUMAN order number the operator types (a leading "#" is stripped).
// FAIL-SAFE: any KV problem just means "no override" and the normal Wix values
// are used. Nothing here ever throws.
//
// Env (set by the Vercel KV / Upstash integration; either name works):
//   KV_REST_API_URL   or  UPSTASH_REDIS_REST_URL
//   KV_REST_API_TOKEN or  UPSTASH_REDIS_REST_TOKEN

const IDX = "order_override:idx"; // a SET of order numbers that have an override
const keyFor = (id) => `order_override:${id}`;

/** Normalize an order number to the stored key form (string, trimmed, no "#"). */
function normId(orderId) {
  return String(orderId ?? "").trim().replace(/^#/, "");
}

function kvCfg() {
  return {
    url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "")
      .trim()
      .replace(/\/$/, ""),
    token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim(),
  };
}

const isConfigured = () => {
  const { url, token } = kvCfg();
  return !!url && !!token;
};

/** POST one Redis command as a JSON array; returns the parsed `result` or null. */
async function kv(args) {
  const { url, token } = kvCfg();
  if (!url || !token) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(`[order-override] kv ${args[0]} HTTP ${res.status}`);
      return null;
    }
    return data?.result ?? null;
  } catch (e) {
    console.warn(`[order-override] kv ${args?.[0]} error:`, e?.message || e);
    return null;
  }
}

/**
 * Read the override for an order.
 * @returns {Promise<null | {product?:string, productImage?:string, note?:string, updatedAt?:string}>}
 */
async function getOverride(orderId) {
  const id = normId(orderId);
  if (!id || !isConfigured()) return null;
  const raw = await kv(["GET", keyFor(id)]);
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

/**
 * Save/replace the override for an order. `product` is required (that's the whole
 * point); `productImage` is optional (blank => status messages fall back to the
 * Viora logo header, which is neutral, never the OLD wrong-colour photo).
 * @returns {Promise<{ok:boolean, error?:string, value?:object}>}
 */
async function setOverride(orderId, { product, productImage, note } = {}) {
  const id = normId(orderId);
  if (!id) return { ok: false, error: "missing order number" };
  const name = String(product ?? "").trim();
  if (!name) return { ok: false, error: "missing product name" };
  if (!isConfigured()) return { ok: false, error: "KV not configured on server" };

  const value = {
    product: name,
    productImage: String(productImage ?? "").trim(),
    note: String(note ?? "").trim(),
    updatedAt: new Date().toISOString(),
  };
  await kv(["SET", keyFor(id), JSON.stringify(value)]);
  await kv(["SADD", IDX, id]); // remember it for listOverrides()
  return { ok: true, value: { orderId: id, ...value } };
}

/** Remove an order's override. */
async function clearOverride(orderId) {
  const id = normId(orderId);
  if (!id) return { ok: false, error: "missing order number" };
  if (!isConfigured()) return { ok: false, error: "KV not configured on server" };
  await kv(["DEL", keyFor(id)]);
  await kv(["SREM", IDX, id]);
  return { ok: true };
}

/** List every stored override (for the admin page). Best-effort; never throws. */
async function listOverrides() {
  if (!isConfigured()) return [];
  const ids = (await kv(["SMEMBERS", IDX])) || [];
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const raws = (await kv(["MGET", ...ids.map(keyFor)])) || [];
  const out = [];
  ids.forEach((id, i) => {
    const raw = raws[i];
    if (!raw) return; // key expired/removed but still in the set — skip
    try {
      const v = typeof raw === "string" ? JSON.parse(raw) : raw;
      out.push({ orderId: id, ...v });
    } catch {
      /* skip a corrupt value */
    }
  });
  // Newest first.
  out.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return out;
}

/**
 * Apply an order's override IN PLACE onto a normalized order object, right before
 * a status message is built. If an override exists, the corrected product name
 * wins and the photo is replaced (or blanked so notify falls back to the logo,
 * never the old wrong-colour photo). Returns the same object for convenience.
 */
async function applyOverride(order) {
  if (!order || !order.orderId) return order;
  const ov = await getOverride(order.orderId);
  if (!ov) return order;
  if (ov.product) order.product = ov.product;
  // Always take control of the photo when an override exists: use the corrected
  // image if given, else "" so notify.js uses the neutral logo header.
  order.productImage = ov.productImage || "";
  console.log(`[order-override] applied to #${normId(order.orderId)} -> "${order.product}"`);
  return order;
}

export {
  getOverride,
  setOverride,
  clearOverride,
  listOverrides,
  applyOverride,
  isConfigured,
};
