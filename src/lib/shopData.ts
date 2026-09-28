import type { products } from "@wix/stores";
import { wixClientServer } from "@/lib/wixClientServer";
import { CATEGORY_LINKS, WIX_COLLECTION_IDS } from "@/lib/categories";
import { CLUB_VIORA_MINIMUM, CLUB_VIORA_PERCENT } from "@/lib/checkoutPricing";
import { getRecentOrderCounts } from "@/lib/popularity";
import { PRICE_CHIPS, SHOP_SORTS, type ShopSort } from "@/lib/shopSorts";
import {
  baseKeyOf,
  bestSellerRank,
  dedupeDesigns,
  inCollection,
  isInStock,
  sellingPrice,
} from "@/lib/catalogue";

// Everything the shop page (/list, /products, /new-arrivals) needs, from ONE
// products query: filtered + sorted designs, category and price chips with
// counts, and a cross-sell rail so small categories never dead-end.

export type { ShopSort };

const CATEGORY_COPY: Record<string, string> = {
  "all-products": "Diamond-style necklace sets and earrings for every occasion.",
  "best-sellers": "Customer favourites — the designs people come back for.",
  "ear-rings": "Statement earrings to wear on their own or with a set.",
  "wedding-reception": "Statement sets for sangeet, reception and wedding functions.",
  "office-parties": "Lighter sets that go from the office to dinner.",
  "new-arrivals": "The latest designs to join Viora.",
};

export type ShopParams = {
  cat?: string;
  q?: string;
  sort?: string;
  under?: string;
  over?: string;
};

export type ShopChip = { slug: string; label: string; count: number; image?: string; active: boolean };
export type PriceChip = { key: string; label: string; under?: number; over?: number; count: number; active: boolean };

export type ShopData = {
  categorySlug: string;
  title: string;
  intro: string;
  query: string;
  sort: ShopSort;
  under: number;
  over: number;
  items: products.Product[];
  /** Designs in this category/search before the price filter. */
  totalBeforePrice: number;
  fromPrice: number | null;
  categories: ShopChip[];
  priceChips: PriceChip[];
  rail: { title: string; subtitle?: string; items: products.Product[] } | null;
  failed: boolean;
};

// ---- search ------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "an", "and", "the", "for", "with", "of", "in", "on", "to", "buy", "online", "new",
  "jewellery", "jewelery", "jewelry", "women", "woman", "girl", "ladies", "artificial",
  "fashion", "imitation", "stylish", "latest", "design", "viora",
]);

/** Query word → words it should also match in a product. */
const SYNONYMS: Record<string, string[]> = {
  necklace: ["set"], neckpiece: ["set"], haar: ["set"], choker: ["set"],
  earing: ["earring"], jhumka: ["earring"], jhumki: ["earring"], stud: ["earring"],
  dangler: ["earring"], drop: ["earring"], tops: ["earring"], bali: ["earring"],
  bridal: ["wedding"], bride: ["wedding"], reception: ["wedding"], sangeet: ["wedding"],
  engagement: ["wedding"], mehendi: ["wedding"], shaadi: ["wedding"],
  party: ["party"], partywear: ["party"], office: ["office"], daily: ["office"], everyday: ["office"],
  gift: ["gift"], rakhi: ["gift"], diwali: ["gift"], birthday: ["gift"], anniversary: ["gift"],
  red: ["ruby", "crimson", "scarlet", "garnet", "maroon", "burgundy"], maroon: ["red", "ruby", "garnet", "burgundy"],
  burgundy: ["maroon", "red"], aqua: ["blue"], purple: ["purple"], black: ["black"],
  blue: ["sapphire", "azure", "navy"], green: ["emerald"], pink: ["rosa", "blush", "rose"],
  white: ["crystal", "pearl"], silver: ["crystal", "silver"],
  diamond: ["diamond", "crystal"], ad: ["diamond", "crystal"], cz: ["diamond", "crystal"],
};

const COLOUR_WORDS = new Set([
  "red", "maroon", "burgundy", "blue", "aqua", "navy", "green", "pink", "white", "silver", "black", "purple",
]);

const singular =(w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singular);

const collectionWords = (p: products.Product) => {
  const tags: string[] = [];
  if (inCollection(p, WIX_COLLECTION_IDS.earrings)) tags.push("earring");
  else tags.push("set", "necklace");
  if (inCollection(p, WIX_COLLECTION_IDS.weddingReception)) tags.push("wedding");
  if (inCollection(p, WIX_COLLECTION_IDS.officeParties)) tags.push("office", "party");
  if (inCollection(p, WIX_COLLECTION_IDS.gifting)) tags.push("gift");
  if (inCollection(p, WIX_COLLECTION_IDS.bestSellers)) tags.push("bestseller");
  return tags;
};

const shortDescOf = (p: products.Product) =>
  (p.additionalInfoSections || []).find((s: any) => s.title === "shortDesc")?.description || "";

/**
 * Type and colour words only match a design's name, colours and collections —
 * descriptions say things like "pair with a necklace" or "red carpet", which
 * would make every search return everything.
 */
const STRONG_ONLY = new Set([
  "set", "necklace", "earring", "wedding", "office", "party", "gift", "bestseller",
  ...Object.keys(SYNONYMS),
  ...Object.values(SYNONYMS).flat(),
]);

type Haystack = { strong: Set<string>; weak: Set<string> };

/** Every query word (or a synonym) must start a word in the name/collections, or equal a description word. */
const matchesQuery = (query: string, hay: Haystack) => {
  const terms = words(query).filter((w) => !STOP_WORDS.has(w));
  if (terms.length === 0) return true;
  const strong = Array.from(hay.strong);
  return terms.every((term) => {
    const options = [term, ...(SYNONYMS[term] || [])];
    return options.some(
      (o) =>
        strong.some((w) => w === o || (o.length >= 3 && w.startsWith(o))) ||
        (!STRONG_ONLY.has(term) && !STRONG_ONLY.has(o) && hay.weak.has(o))
    );
  });
};

// ---- loader ------------------------------------------------------------------

const normaliseSort = (raw: string | undefined, categorySlug: string): ShopSort => {
  if (raw === "asc price") return "price-asc"; // legacy links
  if (raw === "desc price") return "price-desc";
  if (SHOP_SORTS.some((s) => s.key === raw)) return raw as ShopSort;
  return categorySlug === "new-arrivals" ? "new" : "popular";
};

const createdAtOf = (p: products.Product) => {
  const raw = (p as any).createdDate || (p as any)._createdDate || p.lastUpdated;
  const t = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

const titleCase = (slug: string) => slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

export async function loadShopData(params: ShopParams): Promise<ShopData> {
  const categorySlug = params.cat || "all-products";
  const query = (params.q || "").trim().slice(0, 80);
  const sort = normaliseSort(params.sort, categorySlug);
  const under = Math.max(0, Number(params.under) || 0);
  const over = Math.max(0, Number(params.over) || 0);
  const known = CATEGORY_LINKS.find((c) => c.slug === categorySlug);

  const base: ShopData = {
    categorySlug,
    title: known?.label || (categorySlug === "all-products" ? "All Jewellery" : titleCase(categorySlug)),
    intro: CATEGORY_COPY[categorySlug] || CATEGORY_COPY["all-products"],
    query,
    sort,
    under,
    over,
    items: [],
    totalBeforePrice: 0,
    fromPrice: null,
    categories: [],
    priceChips: [],
    rail: null,
    failed: false,
  };
  if (categorySlug === "all-products") base.title = "All Jewellery";

  let all: products.Product[] = [];
  let collectionId = known?.id || "";
  try {
    const wixClient = await wixClientServer();
    const lookup =
      !known && categorySlug !== "all-products"
        ? wixClient.collections.getCollectionBySlug(categorySlug).catch(() => null)
        : Promise.resolve(null);
    const [res, collection] = await Promise.all([wixClient.products.queryProducts().limit(100).find(), lookup]);
    // Every colour is its own Wix product, so the catalogue outgrows one page fast.
    let page = res;
    all = [...(page.items || [])];
    for (let i = 0; i < 5 && page.hasNext(); i++) {
      page = await page.next();
      all.push(...(page.items || []));
    }
    if (collection?.collection?._id) {
      collectionId = collection.collection._id;
      base.title = collection.collection.name || base.title;
    }
  } catch (err) {
    console.error("[shop] catalogue load failed:", err);
    return { ...base, failed: true };
  }

  const orderCounts = await getRecentOrderCounts();
  const designs = dedupeDesigns(all);

  // Search text covers every colour of a design, not just the card shown.
  const haystacks = new Map<string, Haystack>();
  for (const p of all) {
    const key = baseKeyOf(p);
    const hay = haystacks.get(key) || { strong: new Set<string>(), weak: new Set<string>() };
    for (const w of [...words(p.name || ""), ...collectionWords(p)]) hay.strong.add(w);
    for (const w of [...words(shortDescOf(p)), ...words(p.description || "")]) hay.weak.add(w);
    haystacks.set(key, hay);
  }

  const popularity = (p: products.Product) => orderCounts[baseKeyOf(p)] || 0;
  const isNew = (p: products.Product) =>
    inCollection(p, WIX_COLLECTION_IDS.newArrivals) || inCollection(p, WIX_COLLECTION_IDS.freshFromViora);
  const byPopular = (a: products.Product, b: products.Product) =>
    popularity(b) - popularity(a) ||
    bestSellerRank(a) - bestSellerRank(b) ||
    Number(inCollection(b, WIX_COLLECTION_IDS.bestSellers)) - Number(inCollection(a, WIX_COLLECTION_IDS.bestSellers)) ||
    Number(isNew(b)) - Number(isNew(a));
  const comparators: Record<ShopSort, (a: products.Product, b: products.Product) => number> = {
    popular: byPopular,
    new: (a, b) => Number(isNew(b)) - Number(isNew(a)) || createdAtOf(b) - createdAtOf(a) || byPopular(a, b),
    "price-asc": (a, b) => sellingPrice(a) - sellingPrice(b) || byPopular(a, b),
    "price-desc": (a, b) => sellingPrice(b) - sellingPrice(a) || byPopular(a, b),
  };
  // Sold-out designs always sink to the end, whatever the sort.
  const sortDesigns = (list: products.Product[], by: ShopSort) =>
    [...list].sort((a, b) => Number(!isInStock(a)) - Number(!isInStock(b)) || comparators[by](a, b));

  const inCategory = (p: products.Product) =>
    !collectionId || categorySlug === "all-products" || inCollection(p, collectionId);
  // A search for "red" should show each design's red version, not its default colour.
  const colourTerms = words(query).filter((w) => COLOUR_WORDS.has(w));
  const colourOfVariant = (p: products.Product) => words((p.name || "").split(" - ").slice(1).join(" "));
  const variantFor = (p: products.Product) => {
    if (colourTerms.length === 0) return p;
    const wanted = colourTerms.flatMap((t) => [t, ...(SYNONYMS[t] || [])]);
    const hit = (v: products.Product) => colourOfVariant(v).some((w) => wanted.includes(w));
    if (hit(p) && isInStock(p)) return p;
    const siblings = all.filter((v) => baseKeyOf(v) === baseKeyOf(p) && hit(v));
    return siblings.find(isInStock) || p;
  };
  const scoped = designs
    .filter((p) => inCategory(p) && (!query || matchesQuery(query, haystacks.get(baseKeyOf(p)) || { strong: new Set(), weak: new Set() })))
    .map(variantFor);
  const inPrice = (p: products.Product, lo: number, hi: number) => {
    const price = sellingPrice(p);
    return (!lo || price > lo) && (!hi || price <= hi);
  };
  const items = sortDesigns(scoped.filter((p) => inPrice(p, over, under)), sort);

  const prices = scoped.filter(isInStock).map(sellingPrice).filter((n) => n > 0);

  // Each chip gets its category's most popular photo not already used by an earlier chip.
  const usedImages = new Set<string>();
  const categories: ShopChip[] = CATEGORY_LINKS.map((c) => {
    const members = sortDesigns(
      designs.filter((p) => c.slug === "all-products" || inCollection(p, c.id)),
      "popular"
    );
    const photos = members.map((p) => p.media?.mainMedia?.image?.url).filter((u): u is string => !!u);
    const image = photos.find((u) => !usedImages.has(u)) || photos[0];
    if (image) usedImages.add(image);
    return {
      slug: c.slug,
      label: c.slug === "all-products" ? "All" : c.label,
      count: members.length,
      image,
      active: !query && c.slug === categorySlug,
    };
  }).filter((c) => c.count > 0);

  const priceChips: PriceChip[] = PRICE_CHIPS.map((chip) => {
    const lo = "over" in chip ? chip.over : 0;
    const hi = "under" in chip ? chip.under : 0;
    return {
      key: chip.key,
      label: chip.label,
      under: hi || undefined,
      over: lo || undefined,
      count: scoped.filter((p) => inPrice(p, lo, hi)).length,
      active: under === hi && over === lo && (under > 0 || over > 0),
    };
  }).filter((c) => c.count > 0 || c.active);

  // Cross-sell: popular designs not already on screen. Sets come with their own
  // earrings, so set pages aren't steered towards earrings — sets lead the rail.
  const shown = new Set(items.map(baseKeyOf));
  const others = sortDesigns(designs.filter((p) => isInStock(p) && !shown.has(baseKeyOf(p))), "popular");
  const isEarrings = (p: products.Product) => inCollection(p, WIX_COLLECTION_IDS.earrings);
  const sets = others.filter((p) => !isEarrings(p));
  let rail: ShopData["rail"] = null;
  if (others.length > 0 && (items.length < 8 || (!query && categorySlug !== "all-products"))) {
    rail = {
      title: items.length === 0 ? "Customer favourites" : "You may also love",
      subtitle: `Bags of ₹${CLUB_VIORA_MINIMUM}+ get ${CLUB_VIORA_PERCENT}% OFF automatically.`,
      items: [...sets, ...others.filter(isEarrings)].slice(0, 8),
    };
  }

  return {
    ...base,
    items,
    totalBeforePrice: scoped.length,
    fromPrice: prices.length ? Math.min(...prices) : null,
    categories,
    priceChips,
    rail,
  };
}
