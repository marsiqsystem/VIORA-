// GET /api/social-proof -> { weekOrders, byProduct: { [wixProductId]: orders } }
// Counts real orders from the last 7 days in the dashboard order store
// (cancelled and RTO excluded). Only numbers above the display thresholds are
// returned, so small volumes aren't exposed.

import { NextResponse } from "next/server";
import * as ordersStore from "@/lib/crm/orders-store";
import {
  EMPTY_SOCIAL_PROOF,
  PRODUCT_PROOF_MIN,
  SOCIAL_PROOF_MIN_ORDERS,
  type SocialProof,
} from "@/lib/socialProof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MS = 10 * 60 * 1000;
const EXCLUDED_STATUSES = new Set(["cancelled", "rto"]);

let cached: { at: number; body: SocialProof } | null = null;

const respond = (body: SocialProof) =>
  NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
  });

export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_MS) return respond(cached.body);
  if (!ordersStore.isConfigured()) return respond(EMPTY_SOCIAL_PROOF);

  try {
    const { orders } = await ordersStore.listOrders({ limit: 5000 });
    const since = Date.now() - WEEK_MS;
    const counts: Record<string, number> = {};
    let weekOrders = 0;

    for (const order of orders as any[]) {
      if (Number(order.createdAt) < since || EXCLUDED_STATUSES.has(String(order.status))) continue;
      weekOrders++;
      if (order.productId) counts[order.productId] = (counts[order.productId] || 0) + 1;
    }

    const byProduct = Object.fromEntries(
      Object.entries(counts).filter(([, n]) => n >= PRODUCT_PROOF_MIN)
    );
    const body: SocialProof = {
      weekOrders: weekOrders >= SOCIAL_PROOF_MIN_ORDERS ? weekOrders : 0,
      byProduct,
    };
    cached = { at: Date.now(), body };
    return respond(body);
  } catch (err) {
    console.warn("[social-proof] failed:", err);
    return respond(EMPTY_SOCIAL_PROOF);
  }
}
