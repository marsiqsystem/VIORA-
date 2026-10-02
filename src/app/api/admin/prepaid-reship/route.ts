// TEMP admin route — create a PREPAID Velocity order for an order that was placed
// as COD because the customer's original PREPAID order glitched and never landed.
// The customer HAS already paid, so this parcel must ship PREPAID (nothing collected
// on delivery). We reuse the SAME VJ-#<number> reference so the status webhook +
// WhatsApp tracking messages correlate exactly as for any normal order.
//
//   POST /api/admin/prepaid-reship   (x-inbox-key: INBOX_SECRET, or {key})
//
// Body:
//   { "orderNumber":"10600", "amount":574 }        -> DRY RUN (default): shows the
//        EXACT payload that WOULD be created (name/phone/EDITED address/items/amount).
//        Creates nothing on Velocity.
//   { ..., "send": true }                           -> actually create on Velocity.
//   { ..., "mode": "create-only" | "ship" }         -> default "create-only" (lands
//        in Velocity "New Orders", NO wallet charge — ship it from there). "ship"
//        books the courier + AWB now.
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

  const doSend = body?.send === true;
  const mode = String(body?.mode ?? "create-only").trim().toLowerCase();
  const ship = mode === "ship";

  const order = await ordersStore.getOrder(orderNumber);
  if (!order)
    return NextResponse.json({ ok: false, error: `Order ${orderNumber} not found in store.` }, { status: 404 });

  // Single line item carrying the PREPAID total so the parcel's sub_total and the
  // line total agree (buildShipmentPayload uses `amount` for sub_total; cod_collectible
  // is 0 for PREPAID). Keep the real product name + SKU for the label.
  const qty = Number(order.qty) || 1;
  const items = [
    {
      name: order.product || order.dCode || "Jewellery",
      sku: order.dCode || "",
      quantity: qty,
      price: amount, // whole prepaid total on the single line
    },
  ];

  // Force PREPAID + the paid amount. Same VJ-#<number> reference (order.orderId) so
  // tracking + WhatsApp status messages correlate like a normal order.
  const input = {
    orderId: order.orderId,
    orderGuid: order.orderGuid,
    name: order.name,
    phone: order.phone,
    amount, // -> sub_total; cod_collectible stays 0 because paymentMode is PREPAID
    paymentMode: "PREPAID" as const,
    product: order.product || order.dCode,
    dCode: order.dCode,
    address: order.address,
    items,
  };

  const preview = {
    order_id: `VJ-#${order.orderId}`,
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
