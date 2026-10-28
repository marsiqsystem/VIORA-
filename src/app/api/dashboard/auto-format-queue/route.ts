// Auto AI-format the ship-ready queue.
//
//   POST /api/dashboard/auto-format-queue?key=<INBOX_SECRET>
//     body/query: { dryRun?:boolean(default true), limit?:number, orderId?:string }
//
// Runs the address pipeline over every ship-ready order (or one `orderId`): the AI
// cleaner judges SHIP vs CONFIRM, and
//   • SHIP  → (when dryRun=false) the cleaned, courier-ready address is APPLIED to
//             the order, so Velocity/Shiprocket/iThink ship the good version.
//   • CALL  → left for the Call Queue, with a suggested correct pincode where we
//             could recover one.
// Dry-run (the default) writes NOTHING — it returns the before/after preview so the
// operator can eyeball the changes first. Protected by INBOX_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";
import { processOrder } from "@/lib/crm/addressPipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Mirror the Call Queue's "still needs shipping" test so the two agree on scope.
const MIN_ORDER_NO = 10851;
const isPendingShip = (o: any) =>
  !(o.awb && !/^MOCK/i.test(o.awb)) &&
  !["cancelled", "on_hold", "delivered", "rto", "dispatched", "out_for_delivery", "created"].includes(o.status) &&
  !!String(o.name || "").trim() &&
  !!(o.address && (o.address.line1 || o.address.city || o.address.postalCode));

export async function POST(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  let dryRun = sp.get("dryRun") !== "0" && sp.get("dryRun") !== "false"; // default TRUE (safe)
  let limit = Number(sp.get("limit") || 0) || 0;
  let onlyId = String(sp.get("orderId") || "").trim();
  try {
    const b = await req.json();
    if (b && typeof b === "object") {
      if (b.dryRun === false) dryRun = false;
      if (b.limit) limit = Number(b.limit) || limit;
      if (b.orderId) onlyId = String(b.orderId).trim();
    }
  } catch { /* query params only */ }

  // Candidate set.
  let candidates: any[];
  if (onlyId) {
    const o = await ordersStore.getOrder(onlyId);
    candidates = o ? [o] : [];
  } else {
    const { orders } = await ordersStore.listOrders({ limit: 3000 });
    candidates = orders
      .filter((o: any) => isPendingShip(o) && (parseInt(o.orderId, 10) || 0) >= MIN_ORDER_NO)
      .sort((a: any, b: any) => (parseInt(b.orderId, 10) || 0) - (parseInt(a.orderId, 10) || 0));
    if (limit > 0) candidates = candidates.slice(0, limit);
  }

  const rows: any[] = [];
  const counts = { total: candidates.length, ship: 0, call: 0, applied: 0 };
  const BATCH = 6; // bounded concurrency — each does one (cached) AI call at most
  for (let i = 0; i < candidates.length; i += BATCH) {
    const slice = candidates.slice(i, i + BATCH);
    const done: any[] = await Promise.all(
      slice.map(async (o: any): Promise<any> => {
        try {
          return await processOrder(o, { apply: !dryRun, persist: !dryRun });
        } catch (e: any) {
          return { orderId: String(o.orderId), error: e?.message || String(e), route: "error", verdict: "", applied: false };
        }
      })
    );
    for (const d of done) {
      if (d.route === "ship") counts.ship++;
      else if (d.route === "call") counts.call++;
      if (d.applied) counts.applied++;
      const r: any = d.review || {};
      rows.push({
        orderId: d.orderId,
        route: d.route,
        verdict: d.verdict,
        applied: d.applied,
        source: r.source,
        suggestedPincode: r.suggestedPincode || "",
        pinIssue: r.pinIssue || "",
        problems: r.problems || [],
        reason: r.reason || "",
        before: d.before ? [d.before.line1, d.before.line2, d.before.line3, [d.before.city, d.before.state, d.before.postalCode].filter(Boolean).join(", ")].filter(Boolean).join(" | ") : "",
        after: d.after ? [d.after.line1, d.after.line2, d.after.line3, [d.after.city, d.after.state, d.after.postalCode].filter(Boolean).join(", ")].filter(Boolean).join(" | ") : "",
        error: d.error,
      });
    }
  }

  return NextResponse.json({ ok: true, dryRun, counts, rows });
}
