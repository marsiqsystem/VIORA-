// RATE COMPARE for a dashboard order — freight quotes from ALL THREE couriers
// (Velocity, Shiprocket, iThink) side by side, WITHOUT booking anything or
// charging any wallet. Every courier's checkRate is read-only. This is how the
// operator compares before deciding which courier to record + ship the order on.
//
//   POST /api/dashboard/rate-compare?key=<INBOX_SECRET>
//     body: { orderId }                 -> use the stored order's pincode + amount
//     body: { orderId, weightKg }       -> override the parcel weight
//     body: { orderId, toPincode }      -> re-quote with a corrected pincode
//   -> { ok, orderId, toPincode, paymentMode, weightKg, box,
//        couriers: { velocity:{ok,rates,error,cheapest}, shiprocket:{...}, ithink:{...} } }
//
// COD vs PREPAID is taken from the stored order, so each courier is quoted for
// the payment mode this order actually uses. Never books. Never charges.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";
import * as ithink from "@/lib/crm/ithink";
import * as velocity from "@/lib/crm/velocity";
import * as shiprocket from "@/lib/crm/shiprocket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// Reduce a courier's checkRate result to { ok, rates, cheapest, error, needsConfig }.
function summarize(r: any) {
  if (!r || !r.ok) {
    return { ok: false, error: r?.error || "rate check failed", needsConfig: !!r?.needsConfig, rates: [] };
  }
  const rates = Array.isArray(r.rates) ? r.rates : [];
  const cheapest = rates.length ? rates.reduce((a: any, b: any) => (b.rate < a.rate ? b : a)) : null;
  return { ok: true, rates, cheapest, edd: r.edd || null, dryRun: !!r.dryRun };
}

export async function POST(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad JSON" }, { status: 400 }); }
  const orderId = String(body?.orderId || "").trim();
  if (!orderId) return NextResponse.json({ ok: false, error: "orderId required" }, { status: 400 });

  const order = await ordersStore.getOrder(orderId);
  if (!order) return NextResponse.json({ ok: false, error: "order not found in store" }, { status: 404 });

  const toPincode = String(body?.toPincode || order.address?.postalCode || "").trim();
  if (!toPincode) return NextResponse.json({ ok: false, error: "order has no destination pincode" }, { status: 400 });

  // Parcel size scales with the combined unit count — the SAME rule every courier's
  // shipment uses (box 18 x 12 x 4*units cm, 0.2 kg/unit) so the quotes compare fairly.
  const units =
    Array.isArray(order.items) && order.items.length
      ? order.items.reduce((s: number, it: any) => s + (Number(it?.quantity) || 1), 0)
      : Number(order.qty) || 1;
  const dims = { length: 18, breadth: 12, height: 4 * (units || 1) };
  const weightKg = body?.weightKg != null ? Number(body.weightKg) : Number((0.2 * (units || 1)).toFixed(3));

  const args = { toPincode, weightKg, dims, paymentMode: order.paymentMode, amount: order.sellingPrice };

  // All three in parallel — one slow/failing courier never blocks the others.
  const [vel, shp, ith] = await Promise.allSettled([
    velocity.checkRate(args),
    shiprocket.checkRate(args),
    ithink.checkRate(args),
  ]);
  const unwrap = (p: PromiseSettledResult<any>) =>
    p.status === "fulfilled" ? p.value : { ok: false, error: p.reason?.message || "failed" };

  return NextResponse.json({
    ok: true,
    orderId,
    toPincode,
    paymentMode: order.paymentMode || "COD",
    weightKg,
    box: `18 x 12 x ${dims.height}`,
    couriers: {
      velocity: summarize(unwrap(vel)),
      shiprocket: summarize(unwrap(shp)),
      ithink: summarize(unwrap(ith)),
    },
  });
}
