// AI address formatter endpoint for the dashboard's 1-click ship flow.
//
//   GET/POST /api/dashboard/format-address?key=<INBOX_SECRET>&orderId=<num>[&force=1]
//     -> { ok, orderId, name, input, result:{ formatted, text, verdict, ... } }
//
// Builds the BEST raw address first (store record + restore the Wix
// addressLine2 if ours is thin — the line2-drop safety-net), then hands it to
// the AI formatter (Gemini flash-lite, cached per order, ~1 paisa). Protected by
// INBOX_SECRET. Read-only: never ships, never writes the order.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";
import { formatAddress } from "@/lib/crm/addressFormatter";
import { wixAdminClientServer } from "@/lib/wixAdminClientServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handle(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  let orderId = sp.get("orderId") || "";
  let force = sp.get("force") === "1";
  if (req.method === "POST") {
    try {
      const b = await req.json();
      orderId = String(b?.orderId || orderId);
      if (b?.force) force = true;
    } catch {
      /* query params only */
    }
  }
  orderId = String(orderId).trim();
  if (!orderId) return NextResponse.json({ ok: false, error: "orderId required" }, { status: 400 });

  const order: any = await ordersStore.getOrder(orderId);
  if (!order) return NextResponse.json({ ok: false, error: "order not found" }, { status: 404 });

  const address: any = { ...(order.address || {}) };

  // Safety-net: if our stored line2 is empty, restore it from the authoritative
  // Wix order (where the street/area/landmark actually lives) before formatting.
  let restoredLine2 = "";
  if (!String(address.line2 || "").trim() && order.orderGuid) {
    try {
      const wo: any = await wixAdminClientServer().orders.getOrder(order.orderGuid);
      const wa = wo?.shippingInfo?.logistics?.shippingDestination?.address || {};
      const wl2 = String(wa.addressLine2 || "").trim();
      const l1 = String(address.line1 || "").trim().toLowerCase();
      if (wl2 && wl2.toLowerCase() !== l1) {
        address.line2 = wl2;
        restoredLine2 = wl2;
      }
    } catch {
      /* best-effort — format with what we have */
    }
  }

  const result = await formatAddress({
    orderId,
    name: order.name,
    phone: order.phone || order.waPhone,
    address,
    force,
    debug: sp.get("debug") === "1",
  });

  return NextResponse.json({
    ok: true,
    orderId,
    name: order.name,
    courier: order.courier,
    restoredLine2: restoredLine2 || undefined,
    input: address,
    result,
  });
}

export const GET = handle;
export const POST = handle;
