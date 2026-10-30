// TEMP admin route — SILENTLY cancel stale/abandoned orders with ZERO customer
// messages, now or ever. For cleaning out old create-only orders sitting in the
// courier's "New Orders" that were never shipped.
//
// It does ONLY local bookkeeping — it NEVER calls dispatchCancellationOnce, Wix
// or the courier. For each order it:
//   1. Sets a PERMANENT `silentCancel` flag on the store record. dispatchCancella-
//      tionOnce honours this forever (no TTL), so even if you later delete the
//      order in the Velocity/Wix panel and a CANCELLED webhook fires, NO message
//      is sent — fixing the "mute lapsed and a message went out at night" problem.
//   2. Pre-claims the KV cancel key `wa_cancelled_sent:<num>` as a second belt.
//   3. Optionally marks status "cancelled" (markCancelled, default true) so the
//      dashboard shows it cancelled and routines skip it. Pass markCancelled:false
//      to only mute (e.g. the duplicate single orders of a combined parcel, which
//      must stay linked — don't flip their status).
//
//   POST /api/admin/silent-cancel
//     { key, orders:["10917","10803",...], markCancelled?:true, send?:true }
//     send omitted/false -> DRY RUN (shows current status, changes nothing).
//
// DELETE this route once the cleanup is done.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";
import * as idempotency from "@/lib/crm/idempotency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (!authConfigured())
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(body?.key ?? keyFromRequest(req)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const orders: string[] = Array.isArray(body?.orders)
    ? body.orders.map((x: any) => String(x).trim()).filter(Boolean)
    : [];
  if (!orders.length)
    return NextResponse.json({ ok: false, error: "orders[] (order numbers) required" }, { status: 400 });

  const markCancelled = body?.markCancelled !== false; // default true
  const doSend = body?.send === true;

  const results: any[] = [];
  for (const orderId of orders) {
    const existing: any = await ordersStore.getOrder(orderId).catch(() => null);
    const row: any = {
      orderId,
      found: !!existing,
      currentStatus: existing?.status ?? null,
      name: existing?.name ?? null,
      alreadySilent: existing?.silentCancel === true,
    };
    if (doSend) {
      // Belt #2: pre-claim the cancel dedupe key so any immediate webhook is muted.
      try {
        await idempotency.claimOnce(`wa_cancelled_sent:${orderId}`);
      } catch {
        /* fail-open; the silentCancel flag is the real guarantee */
      }
      const patch: any = { silentCancel: true, silentCancelledAt: Date.now() };
      if (markCancelled) {
        patch.status = "cancelled";
        patch.statusAt = Date.now();
      }
      const up = await ordersStore.updateOrder(orderId, patch);
      row.applied = up?.ok === true;
      row.markedCancelled = markCancelled;
    }
    results.push(row);
  }

  return NextResponse.json({
    ok: true,
    dryRun: !doSend,
    markCancelled,
    count: results.length,
    note: doSend
      ? "silentCancel flag set (permanent) + cancel key pre-claimed. NO messages sent; none will fire on a later Velocity/Wix cancel. Delete the orders in the Velocity panel when ready."
      : "DRY RUN — nothing changed. Re-send with send:true to apply.",
    results,
  });
}
