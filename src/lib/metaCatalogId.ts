// Maps a Wix product to the ID our Meta (Facebook) product catalog uses as its
// Content ID / Retailer ID — which is the product's URL SLUG (e.g.
// "ethnic-jewellery-set-d-004"), NOT the Wix product GUID.
//
// Why this exists: Meta matches pixel/CAPI events to catalog products by
// `content_ids`. We were sending `product._id` (a GUID like
// f09f09c9-7d2e-45ff-…), which is absent from the catalog, so Events Manager
// reported "content IDs aren't matching any catalog" and catalog match rate /
// retargeting suffered. The catalog keys on the slug, so every Meta event must
// send the slug.
//
// On the product page we have `product.slug` directly. Downstream (cart page,
// success page) we only have the GUID from cart line items, so we keep a small
// browser-local GUID→slug map, populated whenever a product page is viewed or an
// item is added to cart, and resolve GUIDs back to slugs at checkout/purchase.
// Server-side (CAPI) can't read this map — it derives the slug from the Wix
// order line item URL instead (see slugFromUrl / the checkout route).

const STORE_KEY = "vioraMetaCatalogIds";
const MAX_ENTRIES = 200; // cap so the map can't grow unbounded

type IdMap = Record<string, string>;

const canUseStorage = (): boolean =>
  typeof window !== "undefined" && !!window.localStorage;

const readMap = (): IdMap => {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as IdMap) : {};
  } catch {
    return {};
  }
};

const writeMap = (map: IdMap): void => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode — ignore, we just fall back to the GUID */
  }
};

/** Pull the slug (last non-empty path segment) out of a product page URL. */
export const slugFromUrl = (
  url: string | { relativePath?: string; url?: string } | null | undefined
): string | undefined => {
  if (!url) return undefined;
  const raw = typeof url === "string" ? url : url.relativePath || url.url || "";
  if (!raw) return undefined;
  // Strip protocol/host and any query/hash, then take the last path segment.
  const path = raw.split(/[?#]/)[0].replace(/^https?:\/\/[^/]+/i, "");
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return last ? decodeURIComponent(last) : undefined;
};

/** Remember that this Wix product GUID maps to this catalog slug. Client-only. */
export const rememberMetaCatalogId = (
  productId: string | null | undefined,
  slug: string | null | undefined
): void => {
  if (!productId || !slug || productId === slug) return;
  const map = readMap();
  if (map[productId] === slug) return; // already recorded
  // Evict oldest-ish entries if we hit the cap (JSON object key order is
  // insertion order for string keys, so drop from the front).
  const keys = Object.keys(map);
  if (keys.length >= MAX_ENTRIES) {
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES + 1)) delete map[k];
  }
  map[productId] = slug;
  writeMap(map);
};

/**
 * Translate a Wix product GUID to its catalog slug using the remembered map.
 * Falls back to the GUID itself when unknown, so an event is never emitted with
 * an empty content_id (a stale GUID is no worse than what we send today).
 */
export const resolveMetaCatalogId = (productId: string): string => {
  if (!productId) return productId;
  const map = readMap();
  return map[productId] || productId;
};

/** Array form of resolveMetaCatalogId, preserving order and dropping empties. */
export const resolveMetaCatalogIds = (
  productIds: (string | null | undefined)[]
): string[] => {
  const map = readMap();
  return productIds
    .filter((id): id is string => !!id)
    .map((id) => map[id] || id);
};
