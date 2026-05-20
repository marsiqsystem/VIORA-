export const WIX_COLLECTION_IDS = {
  allProducts: "00000000-000000-000000-000000000001",
  bestSellers: "f523d51c-f073-dc65-a303-f29de1bf6284",
  earrings: "c32134fa-65f8-4a71-b408-15a95ad30b2f",
  freshFromViora: "76cef9a0-6070-8d9e-1ee8-ac48fe1ddca0",
  weddingReception: "32cd0077-5015-2edb-ba44-00179bbd4a4e",
  officeParties: "ecd9a782-8568-a131-2cae-e20596d66a11",
  gifting: "a6182941-f4f6-5a00-5d00-c7e5ae54883d",
  newArrivals: "a0d4ca0c-0035-1b7a-beef-d44d5a3f9aa3",
} as const;

export const ALL_PRODUCTS_FEATURED_ORDER = [
  "noble teardrop harmony set",
  "eternal shine jewelry set",
  "pearl whisper diamond style earrings",
  "emerald bloom ensemble jewelry set",
] as const;

export const CATEGORY_LINKS = [
  { label: "All Products", slug: "all-products", id: WIX_COLLECTION_IDS.allProducts },
  { label: "Best Sellers", slug: "best-sellers", id: WIX_COLLECTION_IDS.bestSellers },
  { label: "Ear Rings", slug: "ear-rings", id: WIX_COLLECTION_IDS.earrings },
  { label: "Fresh From Viora", slug: "fresh-from-viora", id: WIX_COLLECTION_IDS.freshFromViora },
  { label: "Wedding/Reception", slug: "wedding-reception", id: WIX_COLLECTION_IDS.weddingReception },
  { label: "Office Parties", slug: "office-parties", id: WIX_COLLECTION_IDS.officeParties },
  { label: "Gifting", slug: "gifting", id: WIX_COLLECTION_IDS.gifting },
  { label: "New Arrivals", slug: "new-arrivals", id: WIX_COLLECTION_IDS.newArrivals },
] as const;

export const CATEGORY_IDS = Object.fromEntries(
  CATEGORY_LINKS.map((category) => [category.slug, category.id])
) as Record<string, string>;

export const CATEGORY_LABELS = Object.fromEntries(
  CATEGORY_LINKS.map((category) => [category.slug, category.label])
) as Record<string, string>;
