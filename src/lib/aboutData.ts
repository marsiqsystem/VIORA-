import type { products } from "@wix/stores";
import { wixClientServer } from "@/lib/wixClientServer";
import * as ordersStore from "@/lib/crm/orders-store";
import { WIX_COLLECTION_IDS } from "@/lib/categories";
import { loadReviews, type ReviewsSummary } from "@/lib/homeData";
import { bestSellerRank, dedupeDesigns, inCollection, isInStock, sellingPrice } from "@/lib/catalogue";

// Only true, current facts for /about: the live catalogue, real Wix reviews,
// and delivered-order numbers from the dashboard order store. Order numbers
// stay hidden below these thresholds (small numbers read as weak and reveal volumes).
export const DELIVERED_MIN = 100;
export const CITIES_MIN = 15;

export type AboutData = {
  designCount: number;
  fromPrice: number | null;
  heroImage?: string;
  productImages: string[];
  bestSellers: products.Product[];
  reviews: ReviewsSummary | null;
  /** Orders delivered, or null when unknown / under DELIVERED_MIN. */
  delivered: number | null;
  /** Distinct cities delivered to, or null when unknown / under CITIES_MIN. */
  cities: number | null;
};

const imageOf = (p: products.Product) => p.media?.mainMedia?.image?.url || undefined;

async function loadDeliveryNumbers(): Promise<Pick<AboutData, "delivered" | "cities">> {
  if (!ordersStore.isConfigured()) return { delivered: null, cities: null };
  try {
    const { orders } = await ordersStore.listOrders({ limit: 5000 });
    const delivered = (orders as any[]).filter((o) => String(o.status) === "delivered");
    const cities = new Set(
      delivered.map((o) => String(o.address?.city || "").trim().toLowerCase()).filter(Boolean)
    );
    return {
      delivered: delivered.length >= DELIVERED_MIN ? delivered.length : null,
      cities: cities.size >= CITIES_MIN ? cities.size : null,
    };
  } catch (err) {
    console.warn("[about] delivery numbers unavailable:", err);
    return { delivered: null, cities: null };
  }
}

export async function loadAboutData(): Promise<AboutData> {
  const numbers = loadDeliveryNumbers();
  try {
    const wixClient = await wixClientServer();
    let page = await wixClient.products.queryProducts().limit(100).find();
    const all = [...(page.items || [])];
    for (let i = 0; i < 5 && page.hasNext(); i++) {
      page = await page.next();
      all.push(...(page.items || []));
    }
    const productsById = new Map(all.filter((p) => p._id).map((p) => [p._id!, p]));
    const [reviews, delivery] = await Promise.all([loadReviews(wixClient, productsById), numbers]);

    const available = dedupeDesigns(all)
      .filter(isInStock)
      .sort((a, b) => bestSellerRank(a) - bestSellerRank(b));
    // Four: one full desktop row, a short swipe on phones.
    const bestSellers = available.filter((p) => inCollection(p, WIX_COLLECTION_IDS.bestSellers)).slice(0, 4);
    const prices = available.map(sellingPrice).filter((n) => n > 0);
    const productImages = available.map(imageOf).filter((src): src is string => !!src);

    return {
      designCount: available.length,
      fromPrice: prices.length ? Math.min(...prices) : null,
      heroImage: productImages[0],
      productImages,
      bestSellers: bestSellers.length >= 4 ? bestSellers : available.slice(0, 4),
      reviews,
      ...delivery,
    };
  } catch (err) {
    console.error("[about] catalogue load failed:", err);
    return {
      designCount: 0,
      fromPrice: null,
      productImages: [],
      bestSellers: [],
      reviews: null,
      ...(await numbers),
    };
  }
}
