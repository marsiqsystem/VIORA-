// GET /api/pincode?pin=110001 -> { ok, city, state (Wix code), stateName }
// Looks the pincode up with India Post so checkout can fill in city + state.

import { NextRequest, NextResponse } from "next/server";
import { stateCodeFromName } from "@/lib/indiaStates";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const pin = (req.nextUrl.searchParams.get("pin") || "").trim();
  if (!/^[1-9]\d{5}$/.test(pin)) {
    return NextResponse.json({ ok: false, error: "Invalid pincode" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, {
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    const data = await res.json();
    const offices: any[] = data?.[0]?.Status === "Success" ? data[0].PostOffice || [] : [];
    if (offices.length === 0) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const office = offices.find((o) => o?.DeliveryStatus === "Delivery") || offices[0];
    const stateName = String(office?.State || "");
    return NextResponse.json(
      {
        ok: true,
        city: String(office?.District || office?.Block || ""),
        stateName,
        state: stateCodeFromName(stateName) || "",
      },
      { headers: { "Cache-Control": "public, max-age=86400" } }
    );
  } catch (err: any) {
    console.warn("[pincode] lookup failed:", err?.message || err);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
