// iThink RATE CHECK for a dashboard order — returns per-courier freight WITHOUT
// booking anything or charging the wallet (rate/check.json is read-only). This is
// how the operator sees iThink rates BEFORE deciding to book (iThink has no draft
// state, so an unbooked order never appears in the iThink panel to price there).
//
//   POST /api/dashboard/ithink-rate?key=<INBOX_SECRET>
//     body: { orderId }                 -> use the stored order's pincode + amount
//     body: { orderId, weightKg }       -> override the parcel weight
//   -> { ok, rates:[{courier, serviceType, rate, cod, prepaid, tat, zone}], zone, edd, weightKg, box }
//
// Never books. Never charges.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";
import * as ithink from "@/lib/crm/ithink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad JSON" }, { status: 400 }); }
  const orderId = String(body?.orderId || "").trim();
  if (!orderId) return NextResponse.json({ ok: false, error: "orderId required" }, { status: 400 });

  const order = await ordersStore.getOrder(orderId);
  if (!order) return NextResponse.json({ ok: false, error: "order not found in store" }, { status: 404 });

  // Destination pincode: the stored order's, or an explicit override so a WRONG
  // pincode on the order can be re-quoted with the corrected one before fixing it.
  const toPincode = String(body?.toPincode || order.address?.postalCode || "").trim();
  if (!toPincode) return NextResponse.json({ ok: false, error: "order has no destination pincode" }, { status: 400 });

  // Parcel size scales with the combined unit count (same rule the shipment uses):
  // box 18 x 12 x (4*units) cm, weight 0.2*units kg.
  const units =
    Array.isArray(order.items) && order.items.length
      ? order.items.reduce((s: number, it: any) => s + (Number(it?.quantity) || 1), 0)
      : Number(order.qty) || 1;
  const dims = { length: 18, breadth: 12, height: 4 * (units || 1) };
  const weightKg = body?.weightKg != null ? Number(body.weightKg) : Number((0.2 * (units || 1)).toFixed(3));

  const res = await ithink.checkRate({
    toPincode,
    weightKg,
    dims,
    paymentMode: order.paymentMode,
    amount: order.sellingPrice,
  });

  if (!res.ok) return NextResponse.json({ ok: false, error: res.error || "rate check failed", raw: (res as any).raw }, { status: 502 });

  return NextResponse.json({
    ok: true,
    orderId,
    toPincode,
    paymentMode: order.paymentMode,
    weightKg,
    box: `18 x 12 x ${dims.height}`,
    rates: res.rates,
    zone: res.zone,
    edd: res.edd,
  });
}
