// TEMP admin route — (re)create Velocity orders for Wix orders whose
// order_placed webhook never landed them on Velocity (e.g. the Wix automation
// didn't fire, HOLD mode was on, or a transient Velocity error). Mirrors the
// Velocity branch of /api/wix-webhook.
//
//   POST /api/admin/velocity-reprocess     (x-inbox-key: INBOX_SECRET, or {key})
//
// Body:
//   { "numbers": ["10306","10307"] }         -> DRY RUN (default): resolves each
//                                               order (name/phone/amount/payment)
//                                               and reports what WOULD be created.
//                                               Creates NOTHING on Velocity.
//   { "numbers": [...], "send": true }        -> actually create on Velocity.
//   { "force": true }                         -> ignore the once-only claim.
//   { "mode": "ship" | "create-only" }        -> override the create mode; default
//                                               mirrors VELOCITY_SHIP_ON_ORDER
//                                               (ship = assign courier + AWB now).
//
// On failure the route returns Velocity's raw error, so this doubles as the
// diagnosis for WHY the order wasn't created. Protected by INBOX_SECRET.
// DELETE this route once the backfill is done.

import { NextRequest, NextResponse } from "next/server";
import * as wix from "@/lib/crm/wix";
import * as velocity from "@/lib/crm/velocity";
import { claimOnce, release } from "@/lib/crm/idempotency";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const shipByDefault =
  String(process.env.VELOCITY_SHIP_ON_ORDER).trim().toLowerCase() === "true";

async function reprocessOne(order: any, force: boolean, ship: boolean) {
  const id = String(order.orderId ?? order.orderGuid ?? "");
  if (!id) return { ok: false, reason: "no id" };

  const key = `velocity_reprocess:${id}`;
  if (!force) {
    const claim = await claimOnce(key);
    if (!claim.claimed)
      return { ok: false, name: order.name, reason: "already reprocessed (claimed)" };
  }

  const res: any = ship
    ? await velocity.createShipment(order)
    : await velocity.createOrderOnly(order);

  if (res?.ok) {
    // If a shipment was created with an AWB, push tracking back to Wix so the
    // storefront + WhatsApp tracking button work, exactly like the webhook does.
    const wixKey = order.orderGuid || order.orderId;
    if (res.awb && wixKey) {
      try {
        await wix.pushTracking(wixKey, { awb: res.awb, trackingUrl: res.trackingUrl });
      } catch (e: any) {
        console.warn("[velocity-reprocess] pushTracking failed:", e?.message || e);
      }
    }
    return {
      ok: true,
      dryRun: !!res.dryRun,
      mode: ship ? "ship" : "create-only",
      name: order.name,
      velocityOrderId: res.velocityOrderId || null,
      shipmentId: res.shipmentId || null,
      awb: res.awb || null,
    };
  }

  if (!force) await release(key); // let a retry try again
  return {
    ok: false,
    name: order.name,
    error: res?.error || "velocity create failed",
    detail: res?.data || res?.raw || null,
  };
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  if (!authConfigured())
    return NextResponse.json(
      { ok: false, error: "INBOX_SECRET not configured." },
      { status: 503 }
    );
  if (!authOk(body?.key ?? keyFromRequest(req)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const force = body?.force === true;
  const doSend = body?.send === true;
  const modeOverride = String(body?.mode ?? "").trim().toLowerCase();
  const ship =
    modeOverride === "ship" ? true : modeOverride === "create-only" ? false : shipByDefault;

  const numbers: string[] = Array.isArray(body?.numbers)
    ? body.numbers.map((n: any) => String(n).trim()).filter(Boolean)
    : [];
  if (!numbers.length)
    return NextResponse.json(
      { ok: false, error: "numbers[] required (Wix order numbers)." },
      { status: 400 }
    );

  const results: any[] = [];
  for (const number of numbers) {
    const order = await wix.findOrderByNumber(number);
    if (!order) {
      results.push({ number, ok: false, reason: "no wix order" });
      continue;
    }
    if (!doSend) {
      results.push({
        number,
        name: order.name,
        phone: order.phone,
        product: order.product,
        amount: order.amount,
        paymentMode: order.paymentMode,
        existingAwb: order.awb || null,
        wouldCreate: ship ? "ship (courier + AWB)" : "create-only (New Orders)",
      });
      continue;
    }
    results.push({ number, ...(await reprocessOne(order, force, ship)) });
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
