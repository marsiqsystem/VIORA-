import { createClient, OAuthStrategy } from "@wix/sdk";
import { collections, products } from "@wix/stores";
import { cache } from "react";

/**
 * Read-only Wix catalog reader for the Journal.
 *
 * Deliberately NOT `wixClientServer` — that one calls `cookies()`, which opts
 * the caller into dynamic rendering. Journal articles are prerendered via
 * `generateStaticParams`, so reading cookies there would drop them out of
 * static generation. This client is anonymous (clientId only), which is all
 * the public product catalog needs.
 */
const catalogClient = () =>
  createClient({
    modules: { products, collections },
    auth: OAuthStrategy({
      clientId: process.env.NEXT_PUBLIC_WIX_CLIENT_ID!,
    }),
  });

export interface CatalogItem {
  slug: string;
  /** Full Wix name, e.g. "Eternal Shine Jewelry Set - Blue". */
  name: string;
  /** Name with the colour suffix stripped, e.g. "Eternal Shine Jewelry Set". */
  displayName: string;
  colour: string;
  /** What the customer actually pays. */
  price: number;
  /** Pre-discount price; equal to `price` when there's no discount. */
  fullPrice: number;
  image: string;
  /** Collection slugs this product belongs to, e.g. ["gifting", "ear-rings"]. */
  collections: string[];
  inStock: boolean;
}

function splitName(name: string): { base: string; colour: string } {
  const i = name.indexOf(" - ");
  if (i === -1) return { base: name.trim(), colour: "" };
  return { base: name.slice(0, i).trim(), colour: name.slice(i + 3).trim() };
}

/**
 * Fetch every buyable product once per render pass.
 *
 * `cache()` dedupes this across the many <ShopPicks> blocks on a single page.
 * Out-of-stock and hidden products are dropped here, at the source: roughly
 * half the catalog is out of stock at any time, and an article must never link
 * a reader to something they cannot buy.
 *
 * A Wix outage returns [] rather than throwing — ShopPicks degrades to a plain
 * collection link and the build still succeeds.
 */
export const getJournalCatalog = cache(async (): Promise<CatalogItem[]> => {
  try {
    const client = catalogClient();

    const colRes = await client.collections.queryCollections().find();
    const colSlugById = new Map(
      colRes.items.map((c) => [c._id as string, c.slug as string])
    );

    const items: CatalogItem[] = [];
    let query = await client.products.queryProducts().limit(100).find();

    while (true) {
      for (const p of query.items) {
        if (p.visible === false || !p.slug || !p.name) continue;

        const inStock =
          p.stock?.inStock !== false &&
          !(p.stock?.trackInventory === true && (p.stock?.quantity ?? 0) < 1);
        if (!inStock) continue;

        const image =
          p.media?.mainMedia?.image?.url || p.media?.items?.[0]?.image?.url;
        if (!image) continue;

        const { base, colour } = splitName(p.name);

        items.push({
          slug: p.slug,
          name: p.name,
          displayName: base || p.name,
          colour,
          price: p.price?.discountedPrice ?? p.price?.price ?? 0,
          fullPrice: p.price?.price ?? 0,
          image,
          collections: (p.collectionIds ?? [])
            .map((id) => colSlugById.get(id))
            .filter((s): s is string => Boolean(s) && s !== "all-products"),
          inStock: true,
        });
      }

      if (!query.hasNext()) break;
      query = await query.next();
    }

    return items;
  } catch (err) {
    console.error("[journalCatalog] Wix fetch failed:", err);
    return [];
  }
});

export interface PickOptions {
  /** Preferred products, tried first, in order. Silently skipped if sold out. */
  slugs?: string[];
  /** Collection slug to top up from once the preferred picks run out. */
  collection?: string;
  /** Hard price ceiling — needed for articles like "gifts under ₹500". */
  maxPrice?: number;
  limit?: number;
}

/**
 * Resolve an article's product picks against live stock.
 *
 * Never returns sold-out items, and never returns two colourways of the same
 * design when topping up (three shots of the same set reads as padding). Falls
 * back through: explicit slugs → collection → whole catalog, so an article
 * always has something real to link to even after a stock wipeout.
 */
export function pickProducts(
  catalog: CatalogItem[],
  { slugs = [], collection, maxPrice, limit = 3 }: PickOptions
): CatalogItem[] {
  const withinBudget = (p: CatalogItem) =>
    maxPrice === undefined || p.price <= maxPrice;

  const bySlug = new Map(catalog.map((p) => [p.slug, p]));
  const picked: CatalogItem[] = [];
  const takenSlugs = new Set<string>();
  const takenDesigns = new Set<string>();

  for (const slug of slugs) {
    const p = bySlug.get(slug);
    if (!p || !withinBudget(p) || takenSlugs.has(p.slug)) continue;
    picked.push(p);
    takenSlugs.add(p.slug);
    takenDesigns.add(p.displayName);
    if (picked.length >= limit) return picked;
  }

  const topUp = (pool: CatalogItem[]) => {
    // Best-sellers first, then cheapest — the strongest opener for a reader
    // who just finished an article and is deciding whether to click.
    const sorted = [...pool].sort((a, b) => {
      const aBest = a.collections.includes("best-sellers") ? 0 : 1;
      const bBest = b.collections.includes("best-sellers") ? 0 : 1;
      return aBest - bBest || a.price - b.price;
    });

    for (const p of sorted) {
      if (picked.length >= limit) return;
      if (takenSlugs.has(p.slug) || takenDesigns.has(p.displayName)) continue;
      if (!withinBudget(p)) continue;
      picked.push(p);
      takenSlugs.add(p.slug);
      takenDesigns.add(p.displayName);
    }
  };

  if (collection) {
    topUp(catalog.filter((p) => p.collections.includes(collection)));
  }
  if (picked.length < limit) topUp(catalog);

  return picked;
}
