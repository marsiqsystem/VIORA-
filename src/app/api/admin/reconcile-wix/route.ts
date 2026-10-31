// TEMP admin route — reconcile Wix order statuses to match our pipeline for a
// given set of orders. Idempotent: anything already in the target Wix state is
// skipped. Dry-run by default (reads Wix, writes nothing).
//
//   POST /api/admin/reconcile-wix   (x-inbox-key: INBOX_SECRET, or {key})
//
// Body:
//   { "fulfill":["11058",...] }   -> mark FULFILLED (skip if already FULFILLED / CANCELED)
//   { "cancel":["10990",...] }    -> CANCEL (skip if already CANCELED)        [RTO + cancelled]
//   { "pay":["11005",...] }       -> mark COD PAID via addPayments(balance)   [delivered COD]
//   { "send":true }               -> actually write. Omitted/false = DRY RUN (report only).
//
// Paid uses orderTransactions.addPayments(balance) — NOT markOrderAsPaid (which
// leaves the ₹49 COD fee stuck PARTIALLY_PAID). Cancel keeps stock + sends no email.
// Protected by INBOX_SECRET. DELETE this route after the reconcile.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";
import { wixAdminClientServer } from "@/lib/wixAdminClientServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const norm = (x: any) => String(x ?? "").toUpperCase();

async function guidOf(id: string): Promise<string> {
  try {
    const o = await ordersStore.getOrder(id);
    return o?.orderGuid || "";
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (!authConfigured())
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  if (!authOk(body?.key ?? keyFromRequest(req)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const send = body?.send === true;
  const fulfill: string[] = Array.isArray(body?.fulfill) ? body.fulfill.map((x: any) => String(x).trim()).filter(Boolean) : [];
  const cancel: string[] = Array.isArray(body?.cancel) ? body.cancel.map((x: any) => String(x).trim()).filter(Boolean) : [];
  const pay: string[] = Array.isArray(body?.pay) ? body.pay.map((x: any) => String(x).trim()).filter(Boolean) : [];

  const c = wixAdminClientServer();
  const results: any[] = [];

  // ---- FULFILL ----
  for (const id of fulfill) {
    const guid = await guidOf(id);
    if (!guid) { results.push({ id, action: "fulfill", state: "no-guid" }); continue; }
    try {
      const o: any = await c.orders.getOrder(guid);
      const fs = norm(o?.fulfillmentStatus);
      const st = norm(o?.status);
      if (st === "CANCELED") { results.push({ id, action: "fulfill", state: "skip-canceled" }); continue; }
      if (fs === "FULFILLED") { results.push({ id, action: "fulfill", state: "already-fulfilled" }); continue; }
      if (!send) { results.push({ id, action: "fulfill", state: "would-fulfill", fs }); continue; }
      const lineItems = (o?.lineItems || []).filter((li: any) => li?._id).map((li: any) => ({ _id: li._id, quantity: li.quantity ?? 1 }));
      await c.orderFulfillments.createFulfillment(guid, lineItems.length ? { lineItems } : {});
      results.push({ id, action: "fulfill", state: "fulfilled" });
    } catch (e: any) {
      const msg = e?.message || String(e);
      // Wix throws when there's nothing left to fulfill — treat as already done.
      const done = /already|threshold|available:\s*0|no items/i.test(msg);
      results.push({ id, action: "fulfill", state: done ? "already-fulfilled" : "error", error: done ? undefined : msg.slice(0, 160) });
    }
  }

  // ---- CANCEL (RTO + cancelled) ----
  for (const id of cancel) {
    const guid = await guidOf(id);
    if (!guid) { results.push({ id, action: "cancel", state: "no-guid" }); continue; }
    try {
      const o: any = await c.orders.getOrder(guid);
      const st = norm(o?.status);
      if (st === "CANCELED") { results.push({ id, action: "cancel", state: "already-canceled" }); continue; }
      if (!send) { results.push({ id, action: "cancel", state: "would-cancel", st }); continue; }
      await c.orders.cancelOrder(guid, { sendOrderCanceledEmail: false, restockAllItems: false });
      results.push({ id, action: "cancel", state: "canceled" });
    } catch (e: any) {
      results.push({ id, action: "cancel", state: "error", error: (e?.message || String(e)).slice(0, 160) });
    }
  }

  // ---- PAY (delivered COD) ----
  for (const id of pay) {
    const guid = await guidOf(id);
    if (!guid) { results.push({ id, action: "pay", state: "no-guid" }); continue; }
    try {
      const o: any = await c.orders.getOrder(guid);
      const st = norm(o?.status);
      if (st === "CANCELED") { results.push({ id, action: "pay", state: "skip-canceled" }); continue; }
      const bal = Number(o?.balanceSummary?.balance?.amount ?? 0);
      if (!(bal > 0)) { results.push({ id, action: "pay", state: "already-paid", bal }); continue; }
      if (!send) { results.push({ id, action: "pay", state: "would-pay", bal }); continue; }
      await c.orderTransactions.addPayments(guid, [
        {
          amount: { amount: bal.toFixed(2) },
          regularPaymentDetails: { offlinePayment: true, status: "APPROVED", paymentMethod: "Cash on Delivery" },
        } as any,
      ]);
      results.push({ id, action: "pay", state: "paid", bal });
    } catch (e: any) {
      results.push({ id, action: "pay", state: "error", error: (e?.message || String(e)).slice(0, 160) });
    }
  }

  const summary: Record<string, number> = {};
  for (const r of results) summary[`${r.action}:${r.state}`] = (summary[`${r.action}:${r.state}`] || 0) + 1;
  return NextResponse.json({ ok: true, dryRun: !send, counts: { fulfill: fulfill.length, cancel: cancel.length, pay: pay.length }, summary, results });
}
