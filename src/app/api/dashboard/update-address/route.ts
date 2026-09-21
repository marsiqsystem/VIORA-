// Edit an order's SHIP-TO address from the dashboard, ONCE, in an organised way —
// so the operator never has to re-type / fix the address inside each courier panel.
//
//   POST /api/dashboard/update-address?key=<INBOX_SECRET>
//     body: { orderId, addressText, pincode?, city?, state? }
//   -> { ok, order, resolved: { pincode, city, state } }
//
// Flow:
//   1. Take the free-text address the operator pasted (everything in one box).
//   2. Pull the 6-digit pincode out of it (or use the one they typed).
//   3. Resolve city + state from that pincode (India Post lookup, cached).
//   4. Save a STRUCTURED address onto the stored order. Every courier's create /
//      rate call already reads order.address, so the corrected address + pincode
//      flow to Velocity / Shiprocket / iThink automatically — nothing else to do.
//
// This does NOT ship anything and does NOT charge any wallet. It only updates our
// own order record.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";
import { extractPincode, lookupPincode, buildStructuredAddress } from "@/lib/crm/pincode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad JSON" }, { status: 400 }); }

  const orderId = String(body?.orderId || "").trim();
  const addressText = String(body?.addressText || "").trim();
  if (!orderId) return NextResponse.json({ ok: false, error: "orderId required" }, { status: 400 });
  if (!addressText) return NextResponse.json({ ok: false, error: "addressText required" }, { status: 400 });

  const order = await ordersStore.getOrder(orderId);
  if (!order) return NextResponse.json({ ok: false, error: "order not found in store" }, { status: 404 });

  // Pincode: prefer what the operator typed, else pull it from the address text.
  const pincode = String(body?.pincode || "").replace(/\D/g, "") || extractPincode(addressText);
  if (pincode && pincode.length !== 6) {
    return NextResponse.json({ ok: false, error: "pincode must be 6 digits" }, { status: 400 });
  }

  // City/state: prefer what the operator typed, else resolve from the pincode.
  let city = String(body?.city || "").trim();
  let state = String(body?.state || "").trim();
  if (pincode && (!city || !state)) {
    const looked = await lookupPincode(pincode);
    city = city || looked.city;
    state = state || looked.state;
  }

  const address = buildStructuredAddress(addressText, { pincode, city, state, country: "India" });

  await ordersStore.updateOrder(orderId, {
    address,
    addressText, // keep the raw blob so the box can be re-edited later
    addressEdited: true,
  });

  const updated = await ordersStore.getOrder(orderId);
  return NextResponse.json({
    ok: true,
    order: updated,
    resolved: { pincode, city, state },
    note: pincode ? "" : "No 6-digit pincode found in the address — add one so couriers can quote/ship.",
  });
}
