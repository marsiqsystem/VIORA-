// TEMP admin route — create iThink Logistics shipments for existing Wix order
// numbers so the Wix -> iThink pipeline can be verified end-to-end WITHOUT
// touching the live wix-webhook flow. Mirrors /api/admin/shiprocket-test.
//
//   POST /api/admin/ithink-test    (x-inbox-key: INBOX_SECRET, or {key})
//
// Body:
//   { "numbers": ["99999"] }            -> DRY RUN (default): resolves each order
//                                          and reports what WOULD be shipped.
//                                          Creates NOTHING.
//   { "numbers": [...], "send": true }  -> actually create the shipment on iThink
//                                          (order/add.json -> AWB). DEDUCTS WALLET.
//   { "addressOverrides": { "99999": {   -> optional per-order address patch
//        line1, line2, city, state, postalCode, country } } }  merged over the Wix
//                                          address before building the payload.
//
// iThink's add.json always generates an AWB in one call (no "New Orders" state),
// so there is no create-only mode. On failure the route returns iThink's raw
// error, so this doubles as the diagnosis for WHY a create failed. iThink only
// hits the network when ITHINK_ENABLED=true (else it returns a dry-run mock).
// Protected by INBOX_SECRET. DELETE once iThink is verified + wired into the
// live dashboard/webhook flow.

import { NextRequest, NextResponse } from "next/server";
import * as wix from "@/lib/crm/wix";
import * as ithink from "@/lib/crm/ithink";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

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

  const doSend = body?.send === true;
  const addressOverrides: Record<string, any> =
    body?.addressOverrides && typeof body.addressOverrides === "object" ? body.addressOverrides : {};

  const numbers: string[] = Array.isArray(body?.numbers)
    ? body.numbers.map((n: any) => String(n).trim()).filter(Boolean)
    : [];
  if (!numbers.length)
    return NextResponse.json({ ok: false, error: "numbers[] required (Wix order numbers)." }, { status: 400 });

  const results: any[] = [];
  for (const number of numbers) {
    const found = await wix.findOrderByNumber(number);
    if (!found) {
      results.push({ number, ok: false, reason: "no wix order" });
      continue;
    }
    // findOrderByNumber can return a partial order missing the shipping address.
    // Re-fetch the FULL order by GUID so the iThink payload gets city/state/zip.
    let order = found;
    const guid = found.orderGuid || found.orderId;
    if (guid) {
      try {
        const full = await wix.getOrder(guid);
        if (full) order = { ...found, ...full };
      } catch {
        /* keep the search result */
      }
    }
    // Optional hand-correction of the shipping address before building the payload.
    const override = addressOverrides[number] || addressOverrides[String(number)];
    if (override && typeof override === "object") {
      order = { ...order, address: { ...(order.address || {}), ...override } };
    }
    const addr = order.address || {};

    if (!doSend) {
      results.push({
        number,
        name: order.name,
        phone: order.phone,
        product: order.product,
        amount: order.amount,
        paymentMode: order.paymentMode,
        address: {
          line1: addr.line1 || "",
          line2: addr.line2 || "",
          city: addr.city || "",
          state: addr.state || "",
          postalCode: addr.postalCode || "",
        },
        wouldCreate: "ship (iThink order + AWB)",
      });
      continue;
    }

    const res: any = await ithink.createShipment(order);

    results.push({
      number,
      name: order.name,
      ok: !!res.ok,
      dryRun: !!res.dryRun,
      awb: res.awb || null,
      courierName: res.courierName || null,
      courierOrderId: res.courierOrderId || null,
      trackingUrl: res.trackingUrl || null,
      error: res.ok ? undefined : res.error || "ithink create failed",
      detail: res.ok ? undefined : res.raw || res.data || null,
    });
  }

  return NextResponse.json({ ok: true, sent: doSend, results });
}
