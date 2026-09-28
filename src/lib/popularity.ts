import * as ordersStore from "@/lib/crm/orders-store";

// Real pieces ordered per design over the last 30 days, from the dashboard order
// store (cancelled and RTO excluded). Keyed by lowercase base name so every
// colour of a design counts together. Used for ranking only — never displayed.

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_MS = 10 * 60 * 1000;
const EXCLUDED_STATUSES = new Set(["cancelled", "rto"]);

let cached: { at: number; counts: Record<string, number> } | null = null;

/** `{ "eternal shine jewelry set": 12, ... }`; empty when the store is unavailable. */
export async function getRecentOrderCounts(): Promise<Record<string, number>> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.counts;
  if (!ordersStore.isConfigured()) return {};

  try {
    const { orders } = await ordersStore.listOrders({ limit: 5000 });
    const since = Date.now() - WINDOW_MS;
    const counts: Record<string, number> = {};
    for (const order of orders as any[]) {
      if (Number(order.createdAt) < since || EXCLUDED_STATUSES.has(String(order.status))) continue;
      const key = String(order.product || "").split(" - ")[0].trim().toLowerCase();
      if (key) counts[key] = (counts[key] || 0) + Math.max(1, Number(order.qty) || 1);
    }
    cached = { at: Date.now(), counts };
    return counts;
  } catch (err) {
    console.warn("[popularity] order counts unavailable:", err);
    return {};
  }
}
