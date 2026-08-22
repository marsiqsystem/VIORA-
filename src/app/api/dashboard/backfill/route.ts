// One-time (re-runnable) BACKFILL for the dashboard order log. Loads historical
// orders — parsed from the Sales Report Excel client-side — into the KV store so
// the /dashboard Orders table shows all past orders with their real status, courier
// and P&L. Protected by INBOX_SECRET.
//
//   POST /api/dashboard/backfill?key=<INBOX_SECRET>
//     body: { orders: [ { orderId, createdAt, name, dCode, ... }, ... ] }
//   -> { ok, upserted, skipped }
//
// UPSERT + MERGE: an incoming record is merged OVER whatever is already stored, so
// re-running is safe and a later live webhook update on the same order still wins
// (it runs after). Written with the Upstash pipeline API so hundreds of orders go
// in a handful of round-trips instead of one fetch each.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import { blankRecord } from "@/lib/crm/orders-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PREFIX = "orders:";
const INDEX_KEY = "orders:idx:v2"; // must match orders-store INDEX_KEY (see note there)
const rowKey = (id: string) => `${PREFIX}${id}`;

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
async function pipe(cmds: (string | number)[][]) {
  const { url, token } = kvCfg();
  const out: any[] = [];
  for (let i = 0; i < cmds.length; i += 100) {
    const chunk = cmds.slice(i, i + 100);
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    });
    const data = await res.json().catch(() => []);
    if (!res.ok) throw new Error(`kv pipeline ${res.status}`);
    for (const r of data as any[]) out.push(r?.result);
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!authConfigured())
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!kvConfigured())
    return NextResponse.json({ ok: false, error: "KV store not configured" }, { status: 503 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad JSON body" }, { status: 400 });
  }
  const incoming: any[] = Array.isArray(body?.orders) ? body.orders : [];
  if (!incoming.length) return NextResponse.json({ ok: false, error: "no orders" }, { status: 400 });

  // Read existing records for the incoming ids so we MERGE (never blindly wipe a
  // record a live webhook may already have enriched).
  const ids = incoming.map((o) => String(o.orderId || "").trim()).filter(Boolean);
  const existingBlobs = ids.length ? await pipe(ids.map((id) => ["GET", rowKey(id)])) : [];
  const existingById: Record<string, any> = {};
  ids.forEach((id, i) => {
    const b = existingBlobs[i];
    if (b) {
      try {
        existingById[id] = JSON.parse(b);
      } catch {}
    }
  });

  const now = Date.now();
  const cmds: (string | number)[][] = [];
  let upserted = 0;
  let skipped = 0;
  for (const o of incoming) {
    const id = String(o.orderId || "").trim();
    if (!id) {
      skipped++;
      continue;
    }
    const base = existingById[id] || blankRecord();
    const createdAt = Number(o.createdAt) || base.createdAt || now;
    const rec = { ...base, ...o, orderId: id, createdAt, updatedAt: now };
    cmds.push(["SET", rowKey(id), JSON.stringify(rec)]);
    cmds.push(["ZADD", INDEX_KEY, String(createdAt), id]);
    upserted++;
  }
  await pipe(cmds);
  return NextResponse.json({ ok: true, upserted, skipped });
}
