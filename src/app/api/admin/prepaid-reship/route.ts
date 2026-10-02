// TEMP admin route — create a PREPAID Velocity order for an order that was placed
// as COD because the customer's original PREPAID order glitched and never landed.
// The customer HAS already paid, so this parcel must ship PREPAID (nothing collected
// on delivery).
//
// IMPORTANT (Velocity upsert): re-sending the SAME order_id does NOT create a new
// order — Velocity updates the existing one but its payment method is LOCKED (stays
// COD). So to get a genuine PREPAID order we send a DISTINCT reference using a clone
// suffix: "VJ-#10600-1". wix.findOrderByNumber strips the trailing "-N", so the
// status webhook still correlates to Wix order 10600 — WhatsApp + storefront tracking
// keep working.
//
//   POST /api/admin/prepaid-reship   (x-inbox-key: INBOX_SECRET, or {key})
//
// Body:
//   { "orderNumber":"10600", "amount":574, "orderIdSuffix":"-1" }  -> DRY RUN:
//        shows the EXACT payload that WOULD be created (EDITED address/items/amount).
//   { ..., "send": true }                           -> actually create on Velocity.
//   { ..., "mode": "create-only" | "ship" }         -> default "create-only" (New
//        Orders, no wallet charge). "ship" books the courier + AWB now.
//
// Reads the order from OUR dashboard store (not Wix) so the operator-EDITED address
// is honoured (mirrors /api/dashboard/assign-courier). Protected by INBOX_SECRET.
// DELETE this route once the prepaid parcel has shipped.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";
import * as velocity from "@/lib/crm/velocity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  if (!authConfigured())
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  if (!authOk(body?.key ?? keyFromRequest(req)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const orderNumber = String(body?.orderNumber ?? "").trim();
  if (!orderNumber)
    return NextResponse.json({ ok: false, error: "orderNumber required." }, { status: 400 });

  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0)
    return NextResponse.json({ ok: false, error: "amount (prepaid total) required." }, { status: 400 });

  // Distinct reference so Velocity treats it as a NEW order (no upsert onto the
  // locked-COD original). Must be a clone-style suffix ("-1") so wix correlation
  // still strips it back to the base order number.
  const suffix = String(body?.orderIdSuffix ?? "").trim();

  const doSend = body?.send === true;
  const mode = String(body?.mode ?? "create-only").trim().toLowerCase();
  const ship = mode === "ship";

  const order = await ordersStore.getOrder(orderNumber);
  if (!order)
    return NextResponse.json({ ok: false, error: `Order ${orderNumber} not found in store.` }, { status: 404 });

  // Single line item carrying the PREPAID total so the parcel's sub_total and the
  // line total agree (buildShipmentPayload uses `amount` for sub_total; cod_collectible
  // is 0 for PREPAID). Keep the real product name + SKU (Velocity REQUIRES a SKU).
  const qty = Number(order.qty) || 1;
  const sku = order.dCode || (Array.isArray(order.items) && order.items[0]?.sku) || "";
  const items = [
    {
      name: order.product || order.dCode || "Jewellery",
      sku,
      quantity: qty,
      price: amount,
    },
  ];

  // Distinct ref (10600-1 -> VJ-#10600-1), PREPAID, paid amount. buildShipmentPayload
  // prepends "VJ-#".
  const input = {
    orderId: `${order.orderId}${suffix}`,
    orderGuid: order.orderGuid,
    name: order.name,
    phone: order.phone,
    amount,
    paymentMode: "PREPAID" as const,
    product: order.product || order.dCode,
    dCode: sku,
    address: order.address,
    items,
  };

  const preview = {
    order_id: `VJ-#${order.orderId}${suffix}`,
    correlatesToWixNumber: order.orderId,
    customer: order.name,
    phone: order.phone,
    address: order.address,
    payment_method: "PREPAID",
    cod_to_collect: 0,
    sub_total: amount,
    items: items.map((it) => ({ name: it.name, sku: it.sku, units: it.quantity, price: it.price })),
    wouldCreate: ship ? "ship (courier + AWB now)" : "create-only (Velocity New Orders, no charge)",
    storePaymentMode: order.paymentMode,
    storeSellingPrice: order.sellingPrice,
  };

  if (!doSend) {
    return NextResponse.json({ ok: true, dryRun: true, preview });
  }

  const res: any = ship
    ? await velocity.createShipment(input)
    : await velocity.createOrderOnly(input);

  if (!res?.ok)
    return NextResponse.json(
      { ok: false, error: res?.error || "velocity create failed", detail: res?.data || res?.raw || null, preview },
      { status: 502 }
    );

  return NextResponse.json({
    ok: true,
    dryRun: !!res.dryRun,
    mode: ship ? "ship" : "create-only",
    created: preview,
    velocityOrderId: res.velocityOrderId || res.courierOrderId || null,
    shipmentId: res.shipmentId || null,
    awb: res.awb || null,
    trackingUrl: res.trackingUrl || null,
    note: ship
      ? "PREPAID shipment booked on Velocity with an AWB."
      : "PREPAID order created in Velocity NEW ORDERS (no charge). Assign a courier + generate the AWB there when ready.",
  });
}
