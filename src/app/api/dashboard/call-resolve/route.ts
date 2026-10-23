// Record the outcome of a confirmation call and (if confirmed) auto-arrange the
// corrected address onto the order — so a fixed order flows straight to shipping.
//
//   POST /api/dashboard/call-resolve?key=<INBOX_SECRET>
//     body: { orderId, outcome:"confirmed"|"cancelled",
//             pincode?, landmark?, addressLine?, note? }
//   -> { ok, order, resolved?: { pincode, city, state } }
//
//  • outcome "cancelled" -> status=cancelled, silently (NO WhatsApp). Leaves the
//    call queue and the ship queue.
//  • outcome "confirmed" -> stamps callOutcome so it leaves the call queue and is
//    treated as ship-ready. If a pincode / landmark / address line is given, the
//    ship-to address is rebuilt: the pincode is resolved to city+state via India
//    Post (cached) and saved structured, so every courier picks up the fix. This
//    does NOT ship or charge anything.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";
import { lookupPincode, buildStructuredAddress } from "@/lib/crm/pincode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad JSON" }, { status: 400 }); }

  const orderId = String(body?.orderId || "").trim();
  const outcome = String(body?.outcome || "").trim().toLowerCase();
  if (!orderId) return NextResponse.json({ ok: false, error: "orderId required" }, { status: 400 });
  if (outcome !== "confirmed" && outcome !== "cancelled")
    return NextResponse.json({ ok: false, error: "outcome must be 'confirmed' or 'cancelled'" }, { status: 400 });

  const order = await ordersStore.getOrder(orderId);
  if (!order) return NextResponse.json({ ok: false, error: "order not found" }, { status: 404 });

  const note = String(body?.note || "").trim();
  const now = Date.now();

  if (outcome === "cancelled") {
    await ordersStore.updateOrder(orderId, {
      status: "cancelled", statusAt: now,
      callOutcome: "cancelled", callNote: note, callResolvedAt: now,
    });
    const updated = await ordersStore.getOrder(orderId);
    return NextResponse.json({ ok: true, order: updated });
  }

  // CONFIRMED — optionally fix the address.
  const pincode = String(body?.pincode || "").replace(/\D/g, "");
  const landmark = String(body?.landmark || "").trim();
  const addressLine = String(body?.addressLine || "").trim();
  let resolved: { pincode: string; city: string; state: string } | undefined;

  if ((pincode && pincode.length === 6) || landmark || addressLine) {
    const a = order.address || {};
    // Base the new address line on what the operator typed, else keep the old line1,
    // then fold in the landmark.
    const baseLine = addressLine || [a.line1, a.line2, a.line3].filter(Boolean).join(", ");
    const text = [baseLine, landmark ? `Landmark: ${landmark}` : ""].filter(Boolean).join(", ");
    let city = a.city || "";
    let state = a.state || "";
    const pin = pincode && pincode.length === 6 ? pincode : String(a.postalCode || "").replace(/\D/g, "");
    if (pincode && pincode.length === 6) {
      const looked = await lookupPincode(pincode);
      if (looked.city) city = looked.city;
      if (looked.state) state = looked.state;
    }
    const address = buildStructuredAddress(text, { pincode: pin, city, state, country: "India" });
    await ordersStore.updateOrder(orderId, { address, addressText: text, addressEdited: true });
    resolved = { pincode: pin, city, state };
  }

  await ordersStore.updateOrder(orderId, {
    callOutcome: "confirmed", callNote: note, callResolvedAt: now,
  });
  const updated = await ordersStore.getOrder(orderId);
  return NextResponse.json({ ok: true, order: updated, resolved });
}
