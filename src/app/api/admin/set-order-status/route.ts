// Admin route: manually correct an order's PIPELINE status (our KV dashboard).
//
//   POST /api/admin/set-order-status   (x-inbox-key: INBOX_SECRET)
//   { "orderId":"11218", "status":"dispatched" }
//
// Use when the courier feed mis-stamped an order (e.g. a shipped order wrongly
// marked cancelled) and we need the dashboard to read correctly. Writes straight to
// the orders store; does NOT message the customer or touch Wix/courier.
//
// Valid status: new | created | dispatched | out_for_delivery | delivered | rto | cancelled.
// Protected by INBOX_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import { updateOrder, getOrder } from "@/lib/crm/orders-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = new Set(["new", "created", "dispatched", "out_for_delivery", "delivered", "rto", "cancelled"]);

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* query only */ }
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  if (!authOk(body?.key ?? keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const orderId = String(body?.orderId ?? "").trim();
  const status = String(body?.status ?? "").trim().toLowerCase();
  if (!orderId) return NextResponse.json({ ok: false, error: "orderId required" }, { status: 400 });
  if (!VALID.has(status)) return NextResponse.json({ ok: false, error: `status must be one of: ${Array.from(VALID).join(", ")}` }, { status: 400 });

  const before: any = await getOrder(orderId);
  const res = await updateOrder(orderId, { status });
  const after: any = await getOrder(orderId);
  return NextResponse.json({ ok: !!res?.ok, orderId, from: before?.status ?? null, to: after?.status ?? status });
}
