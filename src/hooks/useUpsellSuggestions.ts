"use client";

import { useEffect, useState } from "react";
import type { products } from "@wix/stores";
import type { WixClient } from "@/context/wixContext";
import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";
import { trackMetaEvent } from "@/lib/metaEvents";
import { rememberMetaCatalogId } from "@/lib/metaCatalogId";
import { nextTierFor, type CouponTier } from "@/lib/checkoutPricing";
import { bestSellerRank } from "@/lib/catalogue";

const NO_VARIANT = "00000000-0000-0000-0000-000000000000";
/** Biggest gap to the next ladder step one suggested piece is expected to close. */
export const MAX_UPSELL_GAP = 900;

type Catalog = { products: products.Product[]; earringsCollectionId: string | null };
const EMPTY_CATALOG: Catalog = { products: [], earringsCollectionId: null };

// One catalog fetch per page load, shared by the bag and checkout.
let catalogPromise: Promise<Catalog> | null = null;
const loadCatalog = (wixClient: WixClient) => {
  if (!catalogPromise) {
    catalogPromise = Promise.all([
      wixClient.products.queryProducts().limit(100).find(),
      wixClient.collections.queryCollections().find(),
    ])
      .then(([productRes, collectionRes]) => ({
        products: productRes.items,
        earringsCollectionId: collectionRes.items.find((c) => c.slug === "ear-rings")?._id || null,
      }))
      .catch((err) => {
        console.warn("[upsell] catalog load failed:", err);
        catalogPromise = null;
        return EMPTY_CATALOG;
      });
  }
  return catalogPromise;
};

export type UpsellSuggestion = {
  id: string;
  slug: string;
  name: string;
  image?: string;
  price: number;
  compareAt?: number;
  variantId: string;
  options?: Record<string, string>;
  /** The ladder step this piece alone unlocks, if any. */
  unlocksTier: CouponTier | null;
  isEarrings: boolean;
};

const baseName = (name?: string | null) => (name || "").split(" - ")[0].trim();

/**
 * Pieces worth adding to the bag, best first: the ones that unlock the next
 * ladder step, then best sellers, then by price. Sets already include earrings,
 * so a bag of sets isn't steered towards earrings. One colour per product, nothing already in the
 * bag, only pieces that can be added in one tap.
 */
export function useUpsellSuggestions({ subtotal, limit }: { subtotal: number; limit: number }) {
  const wixClient = useWixClient();
  const cart = useCartStore((s) => s.cart);
  const [catalog, setCatalog] = useState<Catalog>(EMPTY_CATALOG);

  useEffect(() => {
    let alive = true;
    loadCatalog(wixClient).then((data) => {
      if (alive) setCatalog(data);
    });
    return () => {
      alive = false;
    };
  }, [wixClient]);

  const lineItems: any[] = cart.lineItems || [];
  const inCartIds = new Set(lineItems.map((li) => li.catalogReference?.catalogItemId).filter(Boolean));
  const inCartBases = new Set(lineItems.map((li) => baseName(li.productName?.original).toLowerCase()));
  const earringsId = catalog.earringsCollectionId;
  const isEarrings = (p: products.Product) => !!earringsId && (p.collectionIds || []).includes(earringsId);

  const next = nextTierFor(subtotal);
  const gap = next ? next.minimum - subtotal : 0;
  const canUnlock = !!next && gap > 0 && gap <= MAX_UPSELL_GAP;

  const ranked = catalog.products
    .filter(
      (p) =>
        !!p._id &&
        !inCartIds.has(p._id) &&
        p.visible !== false &&
        String(p.productType) !== "digital" &&
        p.stock?.inStock !== false &&
        !(p.stock?.trackInventory === true && (p.stock?.quantity ?? 0) < 1) &&
        (p.productOptions || []).every((o) => (o.choices?.length || 0) <= 1)
    )
    .map((p) => {
      const price = p.price?.discountedPrice || p.price?.price || 0;
      const fullPrice = p.price?.price || 0;
      const options = p.productOptions || [];
      const selected: Record<string, string> = {};
      for (const o of options) {
        const choice = o.choices?.[0]?.description;
        if (o.name && choice) selected[o.name] = choice;
      }
      const suggestion: UpsellSuggestion = {
        id: p._id!,
        slug: p.slug || p._id!,
        name: baseName(p.name),
        image: p.media?.mainMedia?.image?.url || undefined,
        price,
        compareAt: fullPrice > price ? fullPrice : undefined,
        variantId: options.length ? p.variants?.[0]?._id || NO_VARIANT : NO_VARIANT,
        options: Object.keys(selected).length ? selected : undefined,
        unlocksTier: canUnlock && price >= gap ? next : null,
        isEarrings: isEarrings(p),
      };
      const score =
        (suggestion.unlocksTier ? 0 : 1) * 1_000_000 +
        bestSellerRank(p) * 10_000 +
        price;
      return { suggestion, score };
    })
    .sort((a, b) => a.score - b.score);

  const seenBases = new Set<string>();
  const suggestions: UpsellSuggestion[] = [];
  for (const { suggestion } of ranked) {
    const key = suggestion.name.toLowerCase();
    if (inCartBases.has(key) || seenBases.has(key)) continue;
    seenBases.add(key);
    suggestions.push(suggestion);
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}

/** One-tap add for a suggestion, with the same tracking as a normal add to cart. */
export async function addUpsellToCart(
  wixClient: WixClient,
  addItem: (
    client: WixClient,
    productId: string,
    variantId: string,
    quantity: number,
    options?: Record<string, string>
  ) => Promise<void>,
  suggestion: UpsellSuggestion
) {
  rememberMetaCatalogId(suggestion.id, suggestion.slug);
  trackMetaEvent("AddToCart", {
    currency: "INR",
    value: suggestion.price,
    content_ids: [suggestion.slug],
    content_name: suggestion.name,
    content_type: "product",
    contents: [{ id: suggestion.slug, quantity: 1, item_price: suggestion.price }],
    num_items: 1,
  });
  await addItem(wixClient, suggestion.id, suggestion.variantId, 1, suggestion.options);
}
