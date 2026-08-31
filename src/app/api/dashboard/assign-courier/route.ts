// Assign a courier to an order from the dashboard picker.
//
//   POST /api/dashboard/assign-courier?key=<INBOX_SECRET>
//     body: { orderId, courier, ship?: boolean }
//   -> { ok, order }
//
// courier === "velocity": actually creates the order in Velocity — create-only by
//   default (lands in Velocity "New Orders", no AWB/wallet), or a full shipment
//   (AWB + label) when ship:true. The store is updated with courier + ids + status.
// courier === anything else (e.g. "ithink"): the API link is still PENDING, so we
//   only RECORD the chosen courier + status "created" so the operator can ship it
//   in that courier's own dashboard for now.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";
import * as velocity from "@/lib/crm/velocity";
import * as shiprocket from "@/lib/crm/shiprocket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad JSON" }, { status: 400 }); }
  const orderId = String(body?.orderId || "").trim();
  const courier = String(body?.courier || "").trim().toLowerCase();
  if (!orderId || !courier) return NextResponse.json({ ok: false, error: "orderId and courier required" }, { status: 400 });

  const order = await ordersStore.getOrder(orderId);
  if (!order) return NextResponse.json({ ok: false, error: "order not found in store" }, { status: 404 });

  // Couriers with a real API link: velocity and shiprocket.
  const KNOWN = new Set(["velocity", "shiprocket"]);

  // Unknown couriers (e.g. a future one before its API is wired): just record
  // the choice so the operator can ship it in that courier's own dashboard.
  if (!KNOWN.has(courier)) {
    await ordersStore.updateOrder(orderId, { courier, status: "created", statusAt: Date.now() });
    const updated = await ordersStore.getOrder(orderId);
    return NextResponse.json({ ok: true, order: updated, note: `${courier} API link pending — order marked, ship it in ${courier} for now.` });
  }

  // Build the shipment input from the stored order (same shape for both couriers).
  const input = {
    orderId: order.orderId,
    orderGuid: order.orderGuid,
    name: order.name,
    phone: order.phone,
    amount: order.sellingPrice,
    paymentMode: order.paymentMode,
    product: order.product || order.dCode,
    address: order.address,
    items: undefined as any,
  };

  const carrier = courier === "shiprocket" ? shiprocket : velocity;
  // Velocity's create-only returns `velocityOrderId`; Shiprocket's `courierOrderId`.
  const orderIdOf = (r: any) => r?.courierOrderId ?? r?.velocityOrderId ?? "";

  if (body?.ship === true) {
    const res: any = await carrier.createShipment(input);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error || `${courier} ship failed`, raw: res.raw }, { status: 502 });
    await ordersStore.updateOrder(orderId, {
      courier,
      courierOrderId: orderIdOf(res),
      awb: res.awb || "",
      trackingUrl: res.trackingUrl || "",
      status: "dispatched",
      statusAt: Date.now(),
      // capture any freight the create response exposes (best-effort)
      freight: pickFreight(res.raw) ?? order.freight ?? null,
    });
  } else {
    const res: any = await carrier.createOrderOnly(input);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error || `${courier} create failed`, raw: res.raw }, { status: 502 });
    await ordersStore.updateOrder(orderId, {
      courier,
      courierOrderId: orderIdOf(res),
      status: "created",
      statusAt: Date.now(),
    });
  }

  const updated = await ordersStore.getOrder(orderId);
  return NextResponse.json({ ok: true, order: updated });
}

// Best-effort: dig a freight/shipping charge out of a Velocity API response.
function pickFreight(raw: any): number | null {
  const p = raw?.payload || raw || {};
  const cand = p.freight_charge ?? p.freight ?? p.shipping_charge ?? p.total_freight ?? p.charges;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}
