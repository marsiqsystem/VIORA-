// TEMP admin route — reconcile a broadcast's REAL delivery outcome against what
// Meta actually reported. "220 sent / 0 failed" only means Meta ACCEPTED the API
// call; async status webhooks (delivered / read / failed 131049 marketing-cap)
// land later in KV. This reads those back per recipient so we can see who truly
// did NOT receive the message, and why. Read-only. Delete after use.
//
//   GET /api/admin/broadcast-status?key=<INBOX_SECRET>
//       [&id=<broadcastId>]     (default: the most recent broadcast)
//       [&sinceHours=48]        (only count template messages this recent)
//       [&list=notdelivered]    (also return the full recipient list to resend)
//
// -> { ok, broadcast, totals:{recipients,delivered,read,sent_stuck,failed},
//      byError:{ "131049":n, ... }, notDelivered:[{phone,name,status,error}] }

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PREFIX = "wa:";
function kvCfg() {
  return {
    url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/$/, ""),
    token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim(),
  };
}
async function cmd(args: (string | number)[]) {
  const { url, token } = kvCfg();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(`kv ${res.status}`);
  return (data as any)?.result;
}
// Upstash pipeline: many commands, one HTTP round-trip.
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
function parse(x: any, fb: any) {
  if (x == null) return fb;
  if (typeof x === "object") return x;
  try { return JSON.parse(x); } catch { return fb; }
}
// Upstash returns a HASH as a flat [field,value,field,value,...] array.
function hashToObj(arr: any): Record<string, string> {
  const o: Record<string, string> = {};
  if (Array.isArray(arr)) for (let i = 0; i < arr.length; i += 2) o[String(arr[i])] = String(arr[i + 1]);
  else if (arr && typeof arr === "object") Object.assign(o, arr);
  return o;
}

export async function GET(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const sinceHours = Math.max(1, parseInt(sp.get("sinceHours") || "48", 10));
  const wantList = sp.get("list") === "notdelivered";

  // 1) locate the broadcast (most recent unless id given)
  let id = sp.get("id") || "";
  if (!id) {
    const ids = (await cmd(["ZREVRANGE", "bcast:index", 0, 0])) || [];
    id = Array.isArray(ids) ? ids[0] : "";
  }
  const summary = id ? parse(await cmd(["GET", `bcast:${id}`]), null) : null;
  const createdAt = summary?.createdAt || Date.now() - sinceHours * 3600 * 1000;
  const cutoff = Math.min(createdAt, Date.now() - sinceHours * 3600 * 1000);
  const tplName = summary?.templateName || "";

  // 2) all conversation phones
  const phones: string[] = (await cmd(["ZRANGE", `${PREFIX}index`, 0, -1])) || [];

  // 3) pull each phone's messages + status + error maps (pipelined)
  const msgsRes = await pipe(phones.map((p) => ["LRANGE", `${PREFIX}msgs:${p}`, 0, -1]));
  const stRes = await pipe(phones.map((p) => ["HGETALL", `${PREFIX}st:${p}`]));
  const erRes = await pipe(phones.map((p) => ["HGETALL", `${PREFIX}er:${p}`]));

  const totals = { recipients: 0, delivered: 0, read: 0, sent_stuck: 0, failed: 0, no_status: 0 };
  const byError: Record<string, number> = {};
  const notDelivered: any[] = [];

  phones.forEach((phone, i) => {
    const msgs = (msgsRes[i] || []).map((m: any) => parse(m, null)).filter(Boolean);
    const st = hashToObj(stRes[i]);
    const er = hashToObj(erRes[i]);
    // broadcast messages = outbound template messages at/after the broadcast time
    const bmsgs = msgs.filter(
      (m: any) => m && m.dir === "out" && (m.template === true || tplName) && Number(m.ts) >= cutoff - 5 * 60 * 1000
    );
    // prefer ones actually flagged template; else fall back to recent outbound near the send
    const chosen = bmsgs.filter((m: any) => m.template === true);
    const pick = (chosen.length ? chosen : bmsgs).slice(-1)[0];
    if (!pick || !pick.id) return; // this phone wasn't in this broadcast
    totals.recipients++;
    const status = st[pick.id] || "sent"; // accepted but no webhook yet => still 'sent'
    const name = "";
    if (status === "read") totals.read++;
    else if (status === "delivered") totals.delivered++;
    else if (status === "failed") {
      totals.failed++;
      const e = parse(er[pick.id], null);
      const code = e ? String(e.code ?? e.error_code ?? "?") : "?";
      byError[code] = (byError[code] || 0) + 1;
      notDelivered.push({ phone, name: pick.name || name, status, error: code, reason: e?.title || e?.message || "" });
    } else {
      totals.sent_stuck++;
      notDelivered.push({ phone, name: pick.name || name, status, error: "", reason: "accepted, not delivered yet" });
    }
  });

  const received = totals.delivered + totals.read;
  const body: any = {
    ok: true,
    broadcast: { id, template: tplName, createdAt, sent_logged: summary?.sent, failed_logged: summary?.failed },
    totals: { ...totals, received },
    byError,
    notDeliveredCount: notDelivered.length,
  };
  if (wantList) body.notDelivered = notDelivered;
  return NextResponse.json(body);
}
