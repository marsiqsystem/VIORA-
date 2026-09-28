import type { products } from "@wix/stores";
import { wixClientServer } from "@/lib/wixClientServer";
import { WIX_COLLECTION_IDS } from "@/lib/categories";
import { getCategoryImageMap } from "@/lib/getCategoryImageMap";
import { COMBO_PAIR_OVERRIDES, PRICE_BANDS } from "@/data/homeAssets";
import type { PairItem } from "@/components/PairItWith";
import {
  baseNameOf,
  bestSellerRank as rank,
  dedupeDesigns as dedupeByBaseName,
  inCollection,
  isInStock,
  sellingPrice,
} from "@/lib/catalogue";

export { sellingPrice };

// Everything the home page shows about the catalogue, from ONE products query.

/** Show the reviews wall only with at least this many real 4★+ written reviews. */
export const REVIEWS_WALL_MIN = 3;
const RAIL_LIMIT = 8;

export type HomeReview = {
  id: string;
  author: string;
  rating: number;
  title?: string;
  body: string;
  image?: string;
  productName?: string;
  productSlug?: string;
};

export type ReviewsSummary = { average: number; count: number; items: HomeReview[] };

export type PriceBandSummary = {
  key: string;
  label: string;
  href: string;
  count: number;
  fromPrice: number;
  image?: string;
};

export type ComboPair = { first: PairItem; second: PairItem; image?: string };

export type HomeData = {
  bestSellers: products.Product[];
  newArrivals: products.Product[];
  /** Cheapest in-stock set price, for "From ₹X". */
  fromPrice: number | null;
  priceBands: PriceBandSummary[];
  comboPairs: ComboPair[];
  productImages: string[];
  categoryImages: Record<string, string>;
  reviews: ReviewsSummary | null;
};

const imageOf = (p: products.Product) => p.media?.mainMedia?.image?.url || undefined;

// Rough colour family from the variant suffix or product name, so festive combo
// pairs show two different looks. The owner confirms the final pairs (brief S7-C).
const COLOUR_WORDS: [string, string[]][] = [
  ["red", ["red", "ruby", "crimson", "scarlet", "garnet", "maroon"]],
  ["blue", ["blue", "sapphire", "azure", "navy"]],
  ["green", ["green", "emerald"]],
  ["pink", ["pink", "rosa", "blush", "rose"]],
  ["black", ["black", "onyx"]],
  ["white", ["white", "crystal", "pearl", "silver"]],
];
const colourOf = (p: products.Product) => {
  const text = (p.name || "").toLowerCase();
  const suffix = text.split(" - ")[1] || "";
  for (const source of [suffix, text]) {
    for (const [family, words] of COLOUR_WORDS) {
      if (words.some((w) => source.includes(w))) return family;
    }
  }
  return "";
};

export const toPairItem = (p: products.Product): PairItem => {
  const options = p.productOptions || [];
  const selected: Record<string, string> = {};
  for (const o of options) {
    const choice = o.choices?.[0]?.description;
    if (o.name && choice) selected[o.name] = choice;
  }
  const price = sellingPrice(p);
  const full = p.price?.price || price;
  return {
    id: p._id!,
    slug: p.slug || p._id!,
    name: baseNameOf(p),
    image: imageOf(p),
    price,
    compareAt: full > price ? full : undefined,
    variantId: options.length ? p.variants?.[0]?._id || undefined : undefined,
    options: Object.keys(selected).length ? selected : undefined,
    quickAdd: options.every((o) => (o.choices?.length || 0) <= 1),
  };
};

/**
 * Festive combo pairs ("any 2 pieces") from in-stock designs: confirmed
 * overrides first, else up to three pairs of best sellers in different colours.
 * Only pairs that add to the bag in one tap.
 */
export const buildComboPairs = (available: products.Product[]): ComboPair[] => {
  const byBaseName = new Map(available.map((p) => [baseNameOf(p).toLowerCase(), p]));
  const pairs: ComboPair[] = COMBO_PAIR_OVERRIDES.flatMap((o) => {
    const first = byBaseName.get(o.first.toLowerCase());
    const second = byBaseName.get(o.second.toLowerCase());
    return first && second ? [{ first: toPairItem(first), second: toPairItem(second), image: o.image.src || undefined }] : [];
  });
  if (pairs.length === 0) {
    const pool = available
      .filter((p) => toPairItem(p).quickAdd)
      .sort((a, b) => rank(a) - rank(b) || sellingPrice(a) - sellingPrice(b));
    const used = new Set<string>();
    for (const first of pool) {
      if (used.has(first._id!)) continue;
      const colour = colourOf(first);
      const second =
        pool.find((p) => p._id !== first._id && !used.has(p._id!) && colourOf(p) !== colour) ||
        pool.find((p) => p._id !== first._id && !used.has(p._id!));
      if (!second) break;
      used.add(first._id!);
      used.add(second._id!);
      pairs.push({ first: toPairItem(first), second: toPairItem(second) });
      if (pairs.length >= 3) break;
    }
  }
  return pairs.filter((pair) => pair.first.quickAdd && pair.second.quickAdd);
};

export const toHttpsImage = (url?: string) => {
  if (!url) return undefined;
  const match = url.match(/^wix:image:\/\/v1\/([^/#?]+)/);
  return match ? `https://static.wixstatic.com/media/${match[1]}` : url;
};

export async function loadReviews(
  wixClient: Awaited<ReturnType<typeof wixClientServer>>,
  productsById: Map<string, products.Product>
): Promise<ReviewsSummary | null> {
  try {
    const res: any = await wixClient.reviews
      .queryReviews()
      .eq("namespace", "stores")
      .descending("_createdDate")
      .limit(100)
      .find();
    const all: any[] = res.items || [];
    if (all.length === 0) return null;

    const ratings = all.map((r) => Number(r.content?.rating) || 0).filter((n) => n > 0);
    const items: HomeReview[] = all
      .filter((r) => (Number(r.content?.rating) || 0) >= 4 && String(r.content?.body || "").trim().length >= 12)
      .map((r) => {
        const product = productsById.get(r.entityId);
        const media = Array.isArray(r.content?.media) ? r.content.media[0]?.image : undefined;
        return {
          id: r._id,
          author: r.author?.authorName || "Verified buyer",
          rating: Number(r.content?.rating) || 0,
          title: r.content?.title || undefined,
          body: String(r.content.body).trim(),
          image: toHttpsImage(media),
          productName: product ? baseNameOf(product) : undefined,
          productSlug: product?.slug || undefined,
        };
      })
      // Photo reviews first — they persuade most.
      .sort((a, b) => Number(!!b.image) - Number(!!a.image));

    if (items.length < REVIEWS_WALL_MIN || ratings.length === 0) return null;
    const count = Math.max(ratings.length, Number(res.totalCount) || 0);
    const average = ratings.reduce((s, n) => s + n, 0) / ratings.length;
    return { average: Math.round(average * 10) / 10, count, items: items.slice(0, 12) };
  } catch (err) {
    console.error("[home] reviews load failed:", err);
    return null;
  }
}

export async function loadHomeData(): Promise<HomeData> {
  const empty: HomeData = {
    bestSellers: [],
    newArrivals: [],
    fromPrice: null,
    priceBands: [],
    comboPairs: [],
    productImages: [],
    categoryImages: {},
    reviews: null,
  };

  try {
    const wixClient = await wixClientServer();
    const [productRes, categoryImages] = await Promise.all([
      wixClient.products.queryProducts().limit(100).find(),
      getCategoryImageMap(wixClient).catch(() => ({} as Record<string, string>)),
    ]);
    const all = productRes.items || [];
    const productsById = new Map(all.filter((p) => p._id).map((p) => [p._id!, p]));
    const reviews = await loadReviews(wixClient, productsById);

    const designs = dedupeByBaseName(all);
    const available = designs.filter(isInStock);
    const earringsId = WIX_COLLECTION_IDS.earrings;
    const isEarrings = (p: products.Product) => inCollection(p, earringsId);
    const sets = available.filter((p) => !isEarrings(p));

    // Best sellers — in stock only, curated order first.
    const bestSellers = available
      .filter((p) => inCollection(p, WIX_COLLECTION_IDS.bestSellers))
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, RAIL_LIMIT);
    const bestSellerIds = new Set(bestSellers.map((p) => p._id));

    // "More to love": new pieces first, then other in-stock designs not shown
    // above, so the rail is never half empty.
    const isNew = (p: products.Product) =>
      inCollection(p, WIX_COLLECTION_IDS.newArrivals) || inCollection(p, WIX_COLLECTION_IDS.freshFromViora);
    const notBestSeller = available.filter((p) => !bestSellerIds.has(p._id));
    const newArrivals = [
      ...notBestSeller.filter(isNew),
      ...notBestSeller.filter((p) => !isNew(p)).sort((a, b) => sellingPrice(a) - sellingPrice(b)),
    ].slice(0, RAIL_LIMIT);

    const setPrices = sets.map(sellingPrice).filter((n) => n > 0);
    const fromPrice = setPrices.length ? Math.min(...setPrices) : null;

    const priceBands: PriceBandSummary[] = PRICE_BANDS.map((band) => {
      const inBand = available
        .filter((p) => {
          const price = sellingPrice(p);
          if (band.under !== undefined) return price <= band.under;
          if (band.over !== undefined) return price > band.over;
          return false;
        })
        .sort((a, b) => sellingPrice(b) - sellingPrice(a));
      const query = band.under !== undefined ? `under=${band.under}` : `over=${band.over}`;
      return {
        key: band.key,
        label: band.label,
        href: `/list?cat=all-products&${query}#product-grid`,
        count: inBand.length,
        fromPrice: inBand.length ? Math.min(...inBand.map(sellingPrice)) : 0,
        image: band.image.src || imageOf(inBand[0] || ({} as products.Product)),
      };
    }).filter((b) => b.count >= 2);

    const comboPairs = buildComboPairs(available);

    const productImages = bestSellers.map(imageOf).filter((src): src is string => !!src);

    return {
      bestSellers,
      newArrivals,
      fromPrice,
      priceBands,
      comboPairs,
      productImages,
      categoryImages,
      reviews,
    };
  } catch (err) {
    console.error("[home] data load failed:", err);
    return empty;
  }
}
