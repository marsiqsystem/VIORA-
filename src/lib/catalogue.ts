import type { products } from "@wix/stores";

// Catalogue rules shared by the home page and the shop page.

/** Best sellers in this order when there's no order data to rank by. */
export const BEST_SELLER_ORDER = [
  "noble teardrop harmony set",
  "eternal shine jewelry set",
  "emerald bloom ensemble jewelry set",
  "royal heartfall jewelry set",
  "pearl whisper diamond style earrings",
  "crystal wings set",
  "scarlet bloom set",
];

/** Colour shown on listings for designs sold in several colours (base name → colour). */
const PREFERRED_COLOUR: Record<string, string> = {
  "eternal shine jewelry set": "blue",
  "emerald bloom ensemble jewelry set": "pink",
};

export const sellingPrice = (p: products.Product) =>
  p.price?.discountedPrice || p.price?.price || 0;
export const baseNameOf = (p: products.Product) => (p.name || "").split(" - ")[0].trim();
export const baseKeyOf = (p: products.Product) => baseNameOf(p).toLowerCase();
export const isInStock = (p: products.Product) =>
  p.stock?.inStock !== false && p.stock?.quantity !== 0;
export const inCollection = (p: products.Product, id: string) => (p.collectionIds || []).includes(id);

export const bestSellerRank = (p: products.Product) => {
  const i = BEST_SELLER_ORDER.indexOf(baseKeyOf(p));
  return i === -1 ? BEST_SELLER_ORDER.length : i;
};

/**
 * One card per design (colour variants are separate Wix products named
 * "Base - Colour"): the preferred colour if in stock, else the first in-stock
 * colour, else the first listed.
 */
export const dedupeDesigns = (items: products.Product[]) => {
  const byBase = new Map<string, products.Product[]>();
  for (const p of items) {
    const key = baseKeyOf(p) || p._id || "";
    byBase.set(key, [...(byBase.get(key) || []), p]);
  }
  return Array.from(byBase.entries()).map(([key, variants]) => {
    const colour = PREFERRED_COLOUR[key];
    const preferred = colour
      ? variants.find((v) => (v.name || "").split(" - ").slice(1).join(" - ").trim().toLowerCase() === colour)
      : undefined;
    if (preferred && isInStock(preferred)) return preferred;
    return variants.find(isInStock) || variants[0];
  });
};
