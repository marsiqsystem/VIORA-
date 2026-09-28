// TEMP admin route — combine TWO Wix orders from the SAME customer into a SINGLE
// Velocity shipment (one parcel, one AWB). Built for the case where a customer
// placed a PREPAID order and a COD order and both should ship together: the COD
// order's amount is collected on delivery, and the prepaid item rides along at ₹0
// (already paid) so it is NOT charged again. Parcel weight/dimensions scale to the
// combined unit count.
//
//   POST /api/admin/combine-shipment    (x-inbox-key: INBOX_SECRET, or {key})
//
// Body:
//   { "codNumber":"10386", "prepaidNumber":"10385" }      -> DRY RUN (default):
//        resolves both orders and shows the EXACT combined payload that WOULD be
//        created (items, prices, COD-to-collect, weight, box). Creates nothing.
//   { ..., "send": true }                                  -> actually create it.
//   { ..., "mode": "create-only" | "ship" }               -> default "create-only"
//        (lands in Velocity "New Orders", NO charge — ship it from there). "ship"
//        assigns the courier + AWB now.
//   { ..., "prepaidPrice": 0 }                             -> override the prepaid
//        item's shipment price (default 0).
//   { ..., "bothCod": true }                               -> BOTH orders are COD
//        (the same customer placed two COD orders). Collect the SUM of both amounts
//        on delivery and ship every item at its real price — nothing rides at ₹0.
//        (Pass either order as codNumber/prepaidNumber; the parcel is keyed to
//        codNumber for the VJ-#<number> id + WhatsApp/tracking correlation.)
//   { ..., "address": { line1, line2, line3, city, state, postalCode, country } }
//        -> override the ship-to address on the key (COD) order when the Wix
//        address is wrong/incomplete. Provided fields replace; omitted fields keep
//        the Wix value.
//
// DELETE this route once the combined order has shipped.

import { NextRequest, NextResponse } from "next/server";
import * as wix from "@/lib/crm/wix";
import * as velocity from "@/lib/crm/velocity";
import * as ordersStore from "@/lib/crm/orders-store";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import { parcelWeightKg, parcelHeightCm, PACKAGE_BOX } from "@/lib/crm/packageBox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Fetch the FULL Wix order (search then re-fetch by GUID for the address). */
async function fullOrder(number: string) {
  const found = await wix.findOrderByNumber(number);
  if (!found) return null;
  let order: any = found;
  const guid = found.orderGuid || found.orderId;
  if (guid) {
    try {
      const full = await wix.getOrder(guid);
      if (full) order = { ...found, ...full };
    } catch {
      /* keep the search result */
    }
  }
  return order;
}

/** Total units on an order (sum of line-item quantities, min 1). */
function unitsOf(order: any): number {
  const items = Array.isArray(order?.items) ? order.items : [];
  const n = items.reduce((s: number, it: any) => s + (Number(it?.quantity) || 1), 0);
  return n || 1;
}

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

  const codNumber = String(body?.codNumber ?? "").trim();
  const prepaidNumber = String(body?.prepaidNumber ?? "").trim();
  if (!codNumber || !prepaidNumber)
    return NextResponse.json(
      { ok: false, error: "codNumber and prepaidNumber required (Wix order numbers)." },
      { status: 400 }
    );

  const doSend = body?.send === true;
  const mode = String(body?.mode ?? "create-only").trim().toLowerCase();
  const ship = mode === "ship";
  const prepaidPrice = body?.prepaidPrice != null ? Number(body.prepaidPrice) : 0;
  // bothCod: the "prepaid" order is actually a SECOND COD order (same customer,
  // two COD orders). Collect the SUM on delivery; ship every item at real price.
  const bothCod = body?.bothCod === true;
  // Optional ship-to address override (applied to the key/COD order).
  const addressOverride =
    body?.address && typeof body.address === "object" ? body.address : null;

  const cod = await fullOrder(codNumber);
  if (!cod) return NextResponse.json({ ok: false, error: `COD order ${codNumber} not found in Wix` }, { status: 404 });
  const prepaid = await fullOrder(prepaidNumber);
  if (!prepaid) return NextResponse.json({ ok: false, error: `Prepaid order ${prepaidNumber} not found in Wix` }, { status: 404 });

  // Correct the ship-to address on the key (COD) order when supplied.
  if (addressOverride) {
    cod.address = { ...(cod.address || {}), ...addressOverride };
  }

  // COD collect. Default: just the COD order's amount (the prepaid item is already
  // paid). bothCod: the SUM of both orders (both are cash-on-delivery).
  const codAmount = bothCod
    ? (Number(cod.amount) || 0) + (Number(prepaid.amount) || 0)
    : Number(cod.amount) || 0;

  // Combined line items. Default: prepaid products at ₹0 (already paid) + COD
  // products at real price. bothCod: the "prepaid" order's products ALSO at their
  // real price (they will be collected). Fall back to the single product name if an
  // order carries no detailed line items (older orders).
  const prepaidItems =
    Array.isArray(prepaid.items) && prepaid.items.length
      ? prepaid.items.map((it: any) => ({
          name: it.name || prepaid.product || "Jewellery",
          sku: it.sku || undefined,
          quantity: Number(it.quantity) || 1,
          price: bothCod ? (Number(it.price) || Number(prepaid.amount) || 0) : prepaidPrice,
        }))
      : [{
          name: prepaid.product || "Jewellery",
          quantity: unitsOf(prepaid),
          price: bothCod ? (Number(prepaid.amount) || 0) : prepaidPrice,
        }];

  const codItems =
    Array.isArray(cod.items) && cod.items.length
      ? cod.items.map((it: any) => ({
          name: it.name || cod.product || "Jewellery",
          sku: it.sku || undefined,
          quantity: Number(it.quantity) || 1,
          price: Number(it.price) || codAmount,
        }))
      : [{ name: cod.product || "Jewellery", quantity: unitsOf(cod), price: codAmount }];

  const items = [...prepaidItems, ...codItems];
  const totalUnits = items.reduce((s, it) => s + (Number(it.quantity) || 1), 0) || 1;

  // The shipment is keyed to the COD order (the one being collected). Address +
  // contact come from the COD order.
  const shipInput = {
    orderId: cod.orderId,
    orderGuid: cod.orderGuid,
    name: cod.name,
    phone: cod.phone,
    email: cod.email,
    amount: codAmount, // -> sub_total + cod_collectible
    paymentMode: "COD" as const,
    product: cod.product,
    address: cod.address,
    items,
  };

  // Preview the exact parcel maths (mirrors velocity.buildShipmentPayload).
  const preview = {
    order_id: `VJ-#${cod.orderId}`,
    customer: cod.name,
    phone: cod.phone,
    address: cod.address,
    payment_method: "COD",
    cod_to_collect: codAmount,
    items: items.map((it) => ({ name: it.name, units: it.quantity, price: it.price })),
    total_units: totalUnits,
    // Reflect the SINGLE-SOURCE box (packageBox.js) that velocity.buildShipmentPayload
    // actually uses, so the preview matches what gets created.
    weight_kg: parcelWeightKg(totalUnits),
    box_cm: `${PACKAGE_BOX.length} x ${PACKAGE_BOX.breadth} x ${parcelHeightCm(totalUnits)}`,
  };

  const sameCustomer =
    (cod.phone && prepaid.phone && cod.phone === prepaid.phone) ||
    (cod.name && prepaid.name && cod.name.toLowerCase() === prepaid.name.toLowerCase());

  if (!doSend) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      sameCustomer,
      bothCod,
      addressOverridden: !!addressOverride,
      wouldCreate: ship ? "ship (courier + AWB now)" : "create-only (Velocity New Orders)",
      preview,
      cod: { number: cod.orderId, product: cod.product, amount: cod.amount, paymentMode: cod.paymentMode },
      prepaid: { number: prepaid.orderId, product: prepaid.product, amount: prepaid.amount, paymentMode: prepaid.paymentMode },
    });
  }

  const res: any = ship
    ? await velocity.createShipment(shipInput)
    : await velocity.createOrderOnly(shipInput);

  if (!res?.ok)
    return NextResponse.json(
      { ok: false, error: res?.error || "velocity create failed", detail: res?.data || res?.raw || null, preview },
      { status: 502 }
    );

  // Record on our dashboard store: mark BOTH orders on velocity. The combined
  // parcel's AWB (if any) is stamped on both so either order's tracking resolves.
  const patch: any = {
    courier: "velocity",
    courierOrderId: res.velocityOrderId || res.courierOrderId || "",
    awb: res.awb || "",
    trackingUrl: res.trackingUrl || "",
    status: res.awb ? "dispatched" : "created",
    statusAt: Date.now(),
  };
  try {
    await ordersStore.updateOrder(cod.orderId, patch);
    await ordersStore.updateOrder(prepaid.orderId, { ...patch, combinedWith: cod.orderId });
  } catch (e: any) {
    console.warn("[combine-shipment] store update failed:", e?.message || e);
  }

  // If an AWB was generated, push tracking back to BOTH Wix orders so each order's
  // storefront tracking + WhatsApp button point at the shared parcel.
  if (res.awb) {
    for (const o of [cod, prepaid]) {
      const wixKey = o.orderGuid || o.orderId;
      if (wixKey) {
        try {
          await wix.pushTracking(wixKey, { awb: res.awb, trackingUrl: res.trackingUrl, carrier: "Velocity" });
        } catch (e: any) {
          console.warn(`[combine-shipment] pushTracking failed for ${o.orderId}:`, e?.message || e);
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun: !!res.dryRun,
    mode: ship ? "ship" : "create-only",
    created: preview,
    velocityOrderId: res.velocityOrderId || res.courierOrderId || null,
    awb: res.awb || null,
    trackingUrl: res.trackingUrl || null,
    note: ship
      ? "Shipment booked on Velocity with an AWB."
      : "Order created in Velocity NEW ORDERS (no charge). Generate the AWB there when ready.",
  });
}
