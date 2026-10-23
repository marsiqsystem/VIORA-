// Live pincode validation for the Call Queue form — resolve a 6-digit pincode to
// its city + state (India Post, cached) so the operator sees the place update as
// they type the correct pincode the customer gave on the call.
//
//   GET /api/dashboard/pin-lookup?pin=334001&key=<INBOX_SECRET>
//   -> { ok, valid, pincode, city, state }

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import { lookupPincode } from "@/lib/crm/pincode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const pin = String(req.nextUrl.searchParams.get("pin") || "").replace(/\D/g, "");
  if (pin.length !== 6) return NextResponse.json({ ok: true, valid: false, pincode: pin, city: "", state: "" });

  const looked = await lookupPincode(pin);
  const valid = !!(looked.city || looked.state);
  return NextResponse.json({ ok: true, valid, pincode: pin, city: looked.city, state: looked.state });
}
