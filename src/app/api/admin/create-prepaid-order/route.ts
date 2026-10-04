// TEMP admin route — create a brand-new PREPAID Velocity order for Md Firoz.
//
// Firoz's original PREPAID checkout glitched and NO order was ever captured
// (not in Wix, not in our store). He HAS paid Rs.574, and after we asked for his
// address on WhatsApp he sent it. This creates the parcel from scratch, PREPAID
// (nothing to collect on delivery), with a DISTINCT non-sequential reference so
// it can never be confused with / upsert onto a real Wix order number.
//
//   DRY RUN (shows the exact payload, writes nothing):
//     GET /api/admin/create-prepaid-order?key=<INBOX_SECRET>
//   CREATE (Velocity "New Orders", no wallet charge):
//     GET /api/admin/create-prepaid-order?key=<INBOX_SECRET>&send=1
//
// Reference sent to Velocity: VJ-#FRZ-7P3K9  (random, NOT the 10xxx Wix series).
// Delete this route once the parcel is created/shipped.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as velocity from "@/lib/crm/velocity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Distinct, non-sequential reference (becomes "VJ-#FRZ-7P3K9" at Velocity).
const CUSTOM_ORDER_ID = "FRZ-7P3K9";
const AMOUNT = 574; // Rs. prepaid — already paid by the customer

// Address verified against India Post: pincode 852125 = Bihar / Supaul district,
// and "Tekuna" is a real Branch Post Office (Chhatapur area).
const FIROZ = {
  orderId: CUSTOM_ORDER_ID,
  name: "Md Firoz",
  phone: "917368907653",
  amount: AMOUNT,
  paymentMode: "PREPAID" as const,
  product: "Royal Heartfall Jewelry Set - Red",
  dCode: "D-004",
  address: {
    line1: "House No. 21, Village Tekuna",
    line2: "Post: Tekuna, Via Chhatapur",
    line3: "Near Tekuna Post Office, Dist. Supaul, Bihar",
    city: "Supaul",
    postalCode: "852125",
    state: "Bihar",
    country: "India",
  },
  items: [
    { name: "Royal Heartfall Jewelry Set - Red", sku: "D-004", quantity: 1, price: AMOUNT },
  ],
};

async function handle(req: NextRequest, send: boolean) {
  if (!authConfigured())
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  if (!authOk(keyFromRequest(req)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const payload = velocity.buildShipmentPayload(FIROZ);
  const preview = {
    order_id: payload.order_id,
    customer: FIROZ.name,
    phone: FIROZ.phone,
    address: payload.billing_address,
    city: payload.billing_city,
    pincode: payload.billing_pincode,
    state: payload.billing_state,
    payment_method: payload.payment_method, // PREPAID
    cod_to_collect: payload.cod_collectible, // 0
    sub_total: payload.sub_total, // 574
    items: payload.order_items,
    box: { length: payload.length, breadth: payload.breadth, height: payload.height, weight: payload.weight },
  };

  if (!send) return NextResponse.json({ ok: true, dryRun: true, preview });

  const res: any = await velocity.createOrderOnly(FIROZ);
  if (!res?.ok)
    return NextResponse.json(
      { ok: false, error: res?.error || "velocity create failed", detail: res?.data || res?.raw || null, preview },
      { status: 502 }
    );

  return NextResponse.json({
    ok: true,
    dryRun: !!res.dryRun,
    created: preview,
    velocityOrderId: res.velocityOrderId || null,
    shipmentId: res.shipmentId || null,
    note: "PREPAID order created in Velocity NEW ORDERS (no wallet charge). Assign a courier + generate the AWB there when ready.",
  });
}

export async function GET(req: NextRequest) {
  const send = ["1", "true", "yes"].includes((req.nextUrl.searchParams.get("send") || "").toLowerCase());
  return handle(req, send);
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const send = body?.send === true || ["1", "true", "yes"].includes(String(req.nextUrl.searchParams.get("send") || "").toLowerCase());
  return handle(req, send);
}
