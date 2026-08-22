// Dashboard META store — reference data that isn't per-order: current INVENTORY
// (stock by product+colour) and the COD/freight REMITTANCE summary. Held in one
// KV key so the dashboard's Inventory and COD tabs can read it. Seeded from the
// Sales Report Excel now; the COD block will later be refreshed live from the
// Velocity Payments section (Phase 2). Protected by INBOX_SECRET.
//
//   GET  /api/dashboard/meta?key=<INBOX_SECRET>   -> { ok, meta }
//   POST /api/dashboard/meta?key=<INBOX_SECRET>   body: { inventory?, cod? }  -> { ok }

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const META_KEY = "dashboard:meta:v1";

function kvCfg() {
  return {
    url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/$/, ""),
    token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim(),
  };
}
function kvConfigured() {
  const { url, token } = kvCfg();
  return !!url && !!token;
}
async function cmd(args: (string | number)[]) {
  const { url, token } = kvCfg();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(`kv ${res.status}`);
  return (data as any)?.result;
}

export async function GET(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!kvConfigured()) return NextResponse.json({ ok: false, error: "KV not configured" }, { status: 503 });
  let meta: any = { inventory: [], cod: {} };
  try {
    const raw = await cmd(["GET", META_KEY]);
    if (raw) meta = JSON.parse(raw);
  } catch {}
  return NextResponse.json({ ok: true, meta });
}

export async function POST(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!kvConfigured()) return NextResponse.json({ ok: false, error: "KV not configured" }, { status: 503 });
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad JSON" }, { status: 400 }); }
  // Merge onto the existing meta unless reset is set, so inventory and cod can be
  // updated independently.
  let cur: any = { inventory: [], cod: {} };
  if (body?.reset !== true) {
    try { const raw = await cmd(["GET", META_KEY]); if (raw) cur = JSON.parse(raw); } catch {}
  }
  const next = {
    inventory: Array.isArray(body?.inventory) ? body.inventory : cur.inventory || [],
    cod: body?.cod ?? cur.cod ?? {},
    updatedAt: Date.now(),
  };
  await cmd(["SET", META_KEY, JSON.stringify(next)]);
  return NextResponse.json({ ok: true, inventory: next.inventory.length });
}
