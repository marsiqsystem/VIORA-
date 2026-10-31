// TEMP admin route — COMBINE two same-customer orders into ONE Velocity parcel
// (COD), optionally mark the Wix orders fulfilled, and tag them in our store so
// they leave the ship queue (no double-ship).
//
//   POST /api/admin/combine-ship   (x-inbox-key: INBOX_SECRET, or {key})
//
// Body:
//   { "primary":"11062", "secondary":"11065", "discountPct":10 }   -> DRY RUN:
//        shows the EXACT combined Velocity payload + what would be fulfilled/tagged.
//   { ..., "amount":1094.4 }                 -> override the COD total (else computed
//                                               from summed selling price − discountPct).
//   { ..., "send":true }                     -> actually create on Velocity.
//   { ..., "mode":"create-only"|"ship" }     -> default "create-only" (Velocity New
//                                               Orders, no wallet charge; assign courier
//                                               + ship manually). "ship" books AWB now.
//   { ..., "fulfill":["11065"] }             -> Wix order numbers to mark FULFILLED now
//                                               (plain fulfillment, no tracking).
//   { ..., "tagDispatched":["11062","11065"] }-> store orders to move OUT of the ship
//                                               queue (status dispatched + combine note).
//
// The combined parcel ships under VJ-#<primary>; the Velocity status webhook
// correlates to <primary> and auto-fulfills it WITH the real AWB when shipped —
// so for best customer tracking, leave <primary> OUT of `fulfill` and let the
// webhook do it; put only the rider-along <secondary> in `fulfill`.
//
// Reads orders from OUR dashboard store (operator-edited address honoured).
// Protected by INBOX_SECRET. DELETE this route once the parcel has shipped.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";
import * as velocity from "@/lib/crm/velocity";
import * as wix from "@/lib/crm/wix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const round2 = (n: number) => Math.round(n * 100) / 100;

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

  const primaryNo = String(body?.primary ?? "").trim();
  const secondaryNo = String(body?.secondary ?? "").trim();
  if (!primaryNo || !secondaryNo)
    return NextResponse.json({ ok: false, error: "primary and secondary order numbers required." }, { status: 400 });

  const primary = await ordersStore.getOrder(primaryNo);
  const secondary = await ordersStore.getOrder(secondaryNo);
  if (!primary) return NextResponse.json({ ok: false, error: `Order ${primaryNo} not found in store.` }, { status: 404 });
  if (!secondary) return NextResponse.json({ ok: false, error: `Order ${secondaryNo} not found in store.` }, { status: 404 });

  // Combined item list — one line per order, keeping the real product name + SKU
  // (Velocity REQUIRES a SKU). Per-item price is scaled so the item total equals
  // the discounted COD, so sub_total and the lines agree.
  const srcOrders = [primary, secondary];
  const skuOf = (o: any) => o.dCode || (Array.isArray(o.items) && o.items[0]?.sku) || "";
  const priceOf = (o: any) => Number(o.sellingPrice) || 0;
  const qtyOf = (o: any) => Number(o.qty) || 1;

  const origSum = srcOrders.reduce((s, o) => s + priceOf(o), 0);
  const discountPct = Number.isFinite(Number(body?.discountPct)) ? Number(body.discountPct) : 0;
  const codAmount =
    body?.amount != null && Number.isFinite(Number(body.amount)) && Number(body.amount) > 0
      ? round2(Number(body.amount))
      : round2(origSum * (1 - discountPct / 100));

  const factor = origSum > 0 ? codAmount / origSum : 1;
  const items = srcOrders.map((o) => ({
    name: o.product || o.dCode || "Jewellery",
    sku: skuOf(o),
    quantity: qtyOf(o),
    price: round2(priceOf(o) * factor),
  }));
  // Absorb any rounding drift into the first line so the item total == codAmount.
  const drift = round2(codAmount - items.reduce((s, it) => s + it.price, 0));
  if (drift !== 0 && items.length) items[0].price = round2(items[0].price + drift);

  const input = {
    orderId: primary.orderId,
    orderGuid: primary.orderGuid,
    name: primary.name,
    phone: primary.phone,
    amount: codAmount,
    paymentMode: "COD" as const,
    product: items.map((it) => it.name).join(" + "),
    dCode: items[0]?.sku || "",
    address: primary.address,
    items,
  };

  const mode = String(body?.mode ?? "create-only").trim().toLowerCase();
  const ship = mode === "ship";
  const doSend = body?.send === true;
  const fulfill: string[] = Array.isArray(body?.fulfill) ? body.fulfill.map((x: any) => String(x).trim()).filter(Boolean) : [];
  const tagDispatched: string[] = Array.isArray(body?.tagDispatched) ? body.tagDispatched.map((x: any) => String(x).trim()).filter(Boolean) : [];

  const preview = {
    velocityOrderId: `VJ-#${primary.orderId}`,
    correlatesToWixNumber: primary.orderId,
    customer: primary.name,
    phone: primary.phone,
    address: primary.address,
    payment_method: "COD",
    cod_to_collect: codAmount,
    origSum,
    discountPct,
    items: items.map((it) => ({ name: it.name, sku: it.sku, units: it.quantity, price: it.price })),
    wouldCreate: ship ? "ship (courier + AWB now)" : "create-only (Velocity New Orders, no charge)",
    wouldFulfillWix: fulfill,
    wouldTagDispatched: tagDispatched,
    combinedFrom: [primary.orderId, secondary.orderId],
  };

  if (!doSend) return NextResponse.json({ ok: true, dryRun: true, preview });

  // 1) Create the combined order on Velocity.
  const res: any = ship ? await velocity.createShipment(input) : await velocity.createOrderOnly(input);
  if (!res?.ok)
    return NextResponse.json(
      { ok: false, step: "velocity-create", error: res?.error || "velocity create failed", detail: res?.data || res?.raw || null, preview },
      { status: 502 }
    );

  // 2) Mark the requested Wix orders fulfilled.
  const guidByNo: Record<string, string> = { [primary.orderId]: primary.orderGuid, [secondary.orderId]: secondary.orderGuid };
  const fulfilled: any[] = [];
  for (const no of fulfill) {
    const guid = guidByNo[no];
    if (!guid) { fulfilled.push({ orderNo: no, ok: false, error: "unknown order / no guid" }); continue; }
    const r: any = await wix.markFulfilled(guid);
    fulfilled.push({ orderNo: no, ok: !!r?.ok, error: r?.ok ? undefined : r?.error });
  }

  // 3) Tag store orders so they leave the ship queue (no double-ship).
  const tagged: any[] = [];
  for (const no of tagDispatched) {
    try {
      await ordersStore.updateOrder(no, {
        status: "dispatched",
        combinedShipment: `VJ-#${primary.orderId}`,
        callNote: `Combined into one Velocity parcel VJ-#${primary.orderId} (#${primary.orderId} + #${secondary.orderId}), COD ₹${codAmount}.`,
      });
      tagged.push({ orderNo: no, ok: true });
    } catch (e: any) {
      tagged.push({ orderNo: no, ok: false, error: e?.message || String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun: !!res.dryRun,
    mode: ship ? "ship" : "create-only",
    created: preview,
    velocityOrderId: res.velocityOrderId || null,
    shipmentId: res.shipmentId || null,
    awb: res.awb || null,
    trackingUrl: res.trackingUrl || null,
    fulfilled,
    tagged,
    note: ship
      ? "Combined COD shipment booked on Velocity with an AWB."
      : "Combined COD order created in Velocity NEW ORDERS (no charge). Assign a courier + generate the AWB there when ready.",
  });
}
