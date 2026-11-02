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
import { sweepShipQueue } from "@/lib/crm/addressPipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  // Shared with the hourly cron (/api/cron/format-addresses) so manual and
  // automatic sweeps behave identically. apply = !dryRun.
  const { counts, rows } = await sweepShipQueue({ apply: !dryRun, limit, orderId: onlyId });
  return NextResponse.json({ ok: true, dryRun, counts, rows });
}
