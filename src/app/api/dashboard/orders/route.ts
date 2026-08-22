// Dashboard ORDERS API — read the persistent order log for the unified Viora
// dashboard's Orders tab. Protected by INBOX_SECRET (same passcode as the inbox /
// broadcast). Read-only for now; the courier-picker write lands in a later step.
//
//   GET /api/dashboard/orders?key=<INBOX_SECRET>[&limit=200&offset=0]
//     -> { ok, orders:[...], total }
//
// The order records carry everything the table shows: date, id, product, customer,
// qty, selling price, payment mode, courier, status, freight, rtoCost. Money/status
// fields are populated later (picker → courier webhook → payments pull).

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!authConfigured())
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!ordersStore.isConfigured())
    return NextResponse.json({ ok: false, error: "KV store not configured" }, { status: 503 });

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(1000, Math.max(1, parseInt(sp.get("limit") || "200", 10)));
  const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10));

  const { orders, total } = await ordersStore.listOrders({ limit, offset });
  return NextResponse.json({ ok: true, orders, total, limit, offset });
}
