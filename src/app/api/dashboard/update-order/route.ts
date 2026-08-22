// Manually patch one order from the dashboard — e.g. fill the freight + RTO cost
// read off the Velocity Payments section, correct a status, or set the courier.
// This is the manual path until the Velocity-Payments auto-pull lands.
//
//   POST /api/dashboard/update-order?key=<INBOX_SECRET>
//     body: { orderId, patch: { freight?, rtoCost?, status?, courier?, awb?, ... } }
//   -> { ok, order }
//
// Only a whitelist of fields can be patched, and profit is recomputed whenever a
// money field changes so the P&L stays consistent.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NUMERIC = new Set(["freight", "rtoCost", "goodsCost", "prepaidFee", "sellingPrice", "qty"]);
const STRING = new Set(["status", "courier", "awb", "trackingUrl", "paymentReceived", "deliveryStatus", "transitStatus", "pickupStatus", "dCode", "colour"]);

export async function POST(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad JSON" }, { status: 400 }); }
  const orderId = String(body?.orderId || "").trim();
  const patchIn = body?.patch && typeof body.patch === "object" ? body.patch : {};
  if (!orderId) return NextResponse.json({ ok: false, error: "orderId required" }, { status: 400 });

  const order = await ordersStore.getOrder(orderId);
  if (!order) return NextResponse.json({ ok: false, error: "order not found" }, { status: 404 });

  const patch: any = {};
  for (const [k, v] of Object.entries(patchIn)) {
    if (NUMERIC.has(k)) {
      if (v === null || v === "") patch[k] = null;
      else { const n = Number(v); if (Number.isFinite(n)) patch[k] = n; }
    } else if (STRING.has(k)) {
      patch[k] = String(v);
    }
  }

  const merged = { ...order, ...patch };
  // Recompute profit = selling − goodsCost − freight − prepaidFee − rtoCost (× nothing;
  // goodsCost/freight are already per-order totals). Only when we have the pieces.
  const selling = Number(merged.sellingPrice) || 0;
  const parts = [merged.goodsCost, merged.freight, merged.prepaidFee, merged.rtoCost];
  if (selling && parts.some((p) => p != null)) {
    const cost = parts.reduce((s, p) => s + (Number(p) || 0), 0);
    patch.profit = Math.round((selling - cost) * 100) / 100;
  }

  await ordersStore.updateOrder(orderId, patch);
  const updated = await ordersStore.getOrder(orderId);
  return NextResponse.json({ ok: true, order: updated });
}
