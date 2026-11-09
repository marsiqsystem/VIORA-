// Address Intelligence + Courier Selection engine endpoint (spec 2026-11-09).
//
//   POST /api/dashboard/address-courier-engine?key=<INBOX_SECRET>
//     body: { name?, phone?, line1?, line2?, line3?, city?, state?, pincode?, paymentMode?, orderId? }
//   GET  ...&orderId=11119            -> analyse a live order's ship-to address
//   GET  ...&line1=..&city=..&state=..&pincode=..
//
// Runs analyzeAddressCourier (see src/lib/crm/addressCourierEngine.js) and returns
// the structured MODULE C report: BEFORE/AFTER, verification + 0-100 confidence,
// 5-courier comparison (DTDC/Delhivery/Blue Dart/XpressBees/Ekart only), best courier,
// dispatch verdict (SHIP / SHIP AFTER CONFIRMATION / HOLD) and a customer message.
//
// When orderId is given, the ship-to address is pulled from Wix first.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import { analyzeAddressCourier } from "@/lib/crm/addressCourierEngine";
import * as wix from "@/lib/crm/wix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function readInput(req: NextRequest): Promise<any> {
  const sp = req.nextUrl.searchParams;
  let body: any = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { /* query only */ } }
  const g = (k: string) => body?.[k] ?? sp.get(k) ?? undefined;
  return {
    orderId: g("orderId"),
    name: g("name"),
    phone: g("phone"),
    line1: g("line1"),
    line2: g("line2"),
    line3: g("line3"),
    city: g("city"),
    state: g("state"),
    pincode: g("pincode") ?? g("pin"),
    paymentMode: g("paymentMode"),
  };
}

async function handle(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let input = await readInput(req);

  // When only an orderId is given, hydrate the address from the live Wix order.
  if (input.orderId && !input.line1 && !input.pincode) {
    try {
      const o: any = await wix.findOrderByNumber(String(input.orderId));
      if (o?.address) {
        input = {
          ...input,
          name: input.name || o.name,
          phone: input.phone || o.phone,
          line1: o.address.line1 || o.address.addressLine1 || "",
          line2: o.address.line2 || o.address.addressLine2 || "",
          city: o.address.city || "",
          state: o.address.state || o.address.subdivision || "",
          pincode: o.address.postalCode || o.address.zipCode || "",
          paymentMode: input.paymentMode || o.paymentMode,
        };
      }
    } catch { /* fall through with whatever was provided */ }
  }

  if (!input.line1 && !input.pincode && !input.city) {
    return NextResponse.json({ ok: false, error: "provide an address (line1/city/state/pincode) or a valid orderId" }, { status: 400 });
  }

  try {
    const report = await analyzeAddressCourier(input);
    return NextResponse.json({ ok: true, report });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
