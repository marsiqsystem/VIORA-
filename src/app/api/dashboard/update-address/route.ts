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
import { processOrder } from "@/lib/crm/addressPipeline";

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
  // The structured editor (dashboard EditModal) sends a line-by-line `address`
  // object instead of one free-text blob. Accept BOTH so neither path silently
  // no-ops (previously only addressText was read, so EditModal saves 400'd and
  // were swallowed — the operator's fix never persisted).
  const structured =
    body?.address && typeof body.address === "object" ? body.address : null;
  if (!orderId) return NextResponse.json({ ok: false, error: "orderId required" }, { status: 400 });
  if (!addressText && !structured)
    return NextResponse.json({ ok: false, error: "addressText or address required" }, { status: 400 });

  const order = await ordersStore.getOrder(orderId);
  if (!order) return NextResponse.json({ ok: false, error: "order not found in store" }, { status: 404 });

  // Pincode: prefer what the operator typed, else the structured line, else the
  // free text.
  const pinSource =
    String(body?.pincode || "") ||
    String(structured?.postalCode || "") ||
    (addressText ? extractPincode(addressText) : "");
  const pincode = String(pinSource || "").replace(/\D/g, "");
  if (pincode && pincode.length !== 6) {
    return NextResponse.json({ ok: false, error: "pincode must be 6 digits" }, { status: 400 });
  }

  // City/state: prefer typed, else the structured object, else resolve from pincode.
  let city = String(body?.city || structured?.city || "").trim();
  let state = String(body?.state || structured?.state || "").trim();
  if (pincode && (!city || !state)) {
    const looked = await lookupPincode(pincode);
    city = city || looked.city;
    state = state || looked.state;
  }

  // Build the structured address. From the free-text box we split the blob; from
  // the EditModal we take the lines as given (NEVER dropping line2/line3 — the
  // whole point of this fix).
  const address = structured
    ? {
        line1: String(structured.line1 || "").trim(),
        line2: String(structured.line2 || "").trim(),
        line3: String(structured.line3 || "").trim(),
        city,
        state,
        postalCode: pincode,
        country: "India",
        raw: [structured.line1, structured.line2, structured.line3].filter(Boolean).join(", "),
      }
    : buildStructuredAddress(addressText, { pincode, city, state, country: "India" });

  await ordersStore.updateOrder(orderId, {
    address,
    addressText: addressText || address.raw || "", // keep a raw blob so the box can be re-edited later
    addressEdited: true,
  });

  let updated = await ordersStore.getOrder(orderId);

  // Re-review the just-edited address with the AI cleaner: if it now judges the
  // address deliverable (SHIP) it re-arranges it into the proper courier-ready
  // form and applies it; otherwise it only stamps the verdict (so it stays in the
  // Call Queue). Best-effort — a failure here never fails the save.
  let aiReview: any = null;
  try {
    const res: any = await processOrder(updated, { apply: true });
    aiReview = { route: res.route, verdict: res.verdict, applied: res.applied, reason: res.review?.reason || "", suggestedPincode: res.review?.suggestedPincode || "" };
    if (res.applied) updated = await ordersStore.getOrder(orderId);
  } catch (e: any) {
    console.warn("[update-address] AI re-review failed:", e?.message || e);
  }

  return NextResponse.json({
    ok: true,
    order: updated,
    resolved: { pincode, city, state },
    aiReview,
    note: pincode ? "" : "No 6-digit pincode found in the address — add one so couriers can quote/ship.",
  });
}
