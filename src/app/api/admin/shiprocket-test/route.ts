// TEMP admin route — create Shiprocket orders for existing Wix order numbers so
// the Wix -> Shiprocket -> WhatsApp pipeline can be verified end-to-end WITHOUT
// touching the live wix-webhook flow. Mirrors /api/admin/velocity-reprocess.
//
//   POST /api/admin/shiprocket-test    (x-inbox-key: INBOX_SECRET, or {key})
//
// Body:
//   { "numbers": ["10312"] }                 -> DRY RUN (default): resolves each
//                                               order and reports what WOULD be
//                                               created. Creates NOTHING.
//   { "numbers": [...], "send": true }        -> actually create on Shiprocket.
//   { "mode": "ship" | "create-only" }        -> ship = create + assign AWB now;
//                                               create-only (default) = New Orders.
//
// On failure the route returns Shiprocket's raw error, so this doubles as the
// diagnosis for WHY a create failed. Protected by INBOX_SECRET.
// DELETE this route once Shiprocket is verified + wired into the live flow.

import { NextRequest, NextResponse } from "next/server";
import * as wix from "@/lib/crm/wix";
import * as shiprocket from "@/lib/crm/shiprocket";
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
  const ship = String(body?.mode ?? "").trim().toLowerCase() === "ship";

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
    // Re-fetch the FULL order by GUID so the Shiprocket payload gets city/state/zip.
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
    const addr = order.address || {};

    if (!doSend) {
      results.push({
        number,
        name: order.name,
        phone: order.phone,
        product: order.product,
        amount: order.amount,
        paymentMode: order.paymentMode,
        address: { city: addr.city || "", state: addr.state || "", postalCode: addr.postalCode || "" },
        wouldCreate: ship ? "ship (courier + AWB)" : "create-only (New Orders)",
      });
      continue;
    }

    const res: any = ship
      ? await shiprocket.createShipment(order)
      : await shiprocket.createOrderOnly(order);

    results.push({
      number,
      name: order.name,
      ok: !!res.ok,
      dryRun: !!res.dryRun,
      mode: ship ? "ship" : "create-only",
      shipmentId: res.shipmentId || null,
      courierOrderId: res.courierOrderId || null,
      awb: res.awb || null,
      courierName: res.courierName || null,
      error: res.ok ? undefined : res.error || "shiprocket create failed",
      detail: res.ok ? undefined : res.raw || res.data || null,
    });
  }

  const created = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    dryRun: !doSend,
    mode: ship ? "ship" : "create-only",
    created,
    total: numbers.length,
    results,
  });
}
