// TEMP admin route — resend the Rakhi broadcast to recipients whose message
// actually FAILED (mostly Meta 131049 marketing-cap), recomputed live so we only
// hit people who still didn't receive it. Skips dead numbers (131026) and anyone
// already delivered/read or merely "stuck" (avoids duplicates). Meant to run ~24h
// after the original blast, once the per-user marketing window has reset.
//
//   GET /api/admin/broadcast-resend?key=<INBOX_SECRET>&mediaId=<metaMediaId>
//       [&sinceHours=72] [&dryRun=1] [&throttleMs=150]
//
// -> { ok, targeted, sent, failed, byError, dryRun }
// Delete this file (and broadcast-status) once the resend is done.

import { NextRequest, NextResponse } from "next/server";
import { sendTemplate, config } from "@/lib/crm/whatsapp";
import { recordOutbound, authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PREFIX = "wa:";
const TEMPLATE = "rakhi_luxe_gift_v1";
const LANG = "en_US";
// Failure codes worth retrying (cap / experiment hold). 131026 = undeliverable
// (not on WhatsApp) → never retry.
const RETRY_CODES = new Set(["131049", "130472", "131047", "131048", "0", "?"]);

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
function hashToObj(arr: any): Record<string, string> {
  const o: Record<string, string> = {};
  if (Array.isArray(arr)) for (let i = 0; i < arr.length; i += 2) o[String(arr[i])] = String(arr[i + 1]);
  else if (arr && typeof arr === "object") Object.assign(o, arr);
  return o;
}
function firstName(n: string) {
  const t = String(n || "").trim().split(/\s+/)[0];
  // drop honorifics so "{{1}}" reads naturally
  return /^(dr|mr|mrs|ms|prof)\.?$/i.test(t) ? String(n).trim().split(/\s+/)[1] || t : t;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const mediaId = (sp.get("mediaId") || "").trim();
  const dryRun = sp.get("dryRun") === "1";
  const sinceHours = Math.max(1, parseInt(sp.get("sinceHours") || "72", 10));
  const throttleMs = Math.max(0, parseInt(sp.get("throttleMs") || "150", 10));
  if (!mediaId && !dryRun) {
    return NextResponse.json({ ok: false, error: "mediaId required (Meta media id for the header image)." }, { status: 400 });
  }

  const { sendEnabled } = config();
  const cutoff = Date.now() - sinceHours * 3600 * 1000;

  // locate broadcast window
  const ids = (await cmd(["ZREVRANGE", "bcast:index", 0, 0])) || [];
  const bid = Array.isArray(ids) ? ids[0] : "";
  const summary = bid ? parse(await cmd(["GET", `bcast:${bid}`]), null) : null;
  const winStart = Math.min(summary?.createdAt || cutoff, cutoff);

  const phones: string[] = (await cmd(["ZRANGE", `${PREFIX}index`, 0, -1])) || [];
  const msgsRes = await pipe(phones.map((p) => ["LRANGE", `${PREFIX}msgs:${p}`, 0, -1]));
  const stRes = await pipe(phones.map((p) => ["HGETALL", `${PREFIX}st:${p}`]));
  const erRes = await pipe(phones.map((p) => ["HGETALL", `${PREFIX}er:${p}`]));
  const convRes = await pipe(phones.map((p) => ["GET", `${PREFIX}conv:${p}`]));

  // build the retry target list
  const targets: { phone: string; name: string; code: string }[] = [];
  phones.forEach((phone, i) => {
    const msgs = (msgsRes[i] || []).map((m: any) => parse(m, null)).filter(Boolean);
    const st = hashToObj(stRes[i]);
    const er = hashToObj(erRes[i]);
    const conv = parse(convRes[i], {}) || {};
    const bmsgs = msgs.filter((m: any) => m && m.dir === "out" && m.template === true && Number(m.ts) >= winStart - 5 * 60 * 1000);
    const pick = bmsgs.slice(-1)[0];
    if (!pick || !pick.id) return;
    const status = st[pick.id] || "sent";
    if (status !== "failed") return; // only retry terminal failures (skip delivered/read/stuck)
    const e = parse(er[pick.id], null);
    const code = e ? String(e.code ?? e.error_code ?? "?") : "?";
    if (!RETRY_CODES.has(code)) return; // skip 131026 (undeliverable) etc.
    targets.push({ phone, name: firstName(conv.name || pick.name || ""), code });
  });

  if (dryRun) {
    const byError: Record<string, number> = {};
    targets.forEach((t) => (byError[t.code] = (byError[t.code] || 0) + 1));
    return NextResponse.json({ ok: true, dryRun: true, targeted: targets.length, byError, sendEnabled, sample: targets.slice(0, 8) });
  }

  let sent = 0, failed = 0;
  const byError: Record<string, number> = {};
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const res: any = await sendTemplate({
      to: t.phone,
      templateName: TEMPLATE,
      languageCode: LANG,
      headerMediaId: mediaId,
      bodyParams: [t.name || "there"],
    });
    if (res?.ok) {
      sent++;
      const wamid = res?.data?.messages?.[0]?.id;
      try {
        await recordOutbound({
          to: t.phone, text: `📢 ${TEMPLATE} (resend)`, wamid,
          name: t.name || undefined, status: "sent", template: true,
        });
      } catch { /* mirror best-effort */ }
    } else {
      failed++;
      const code = String(res?.error?.code ?? res?.data?.error?.code ?? "?");
      byError[code] = (byError[code] || 0) + 1;
    }
    if (i < targets.length - 1 && throttleMs) await sleep(throttleMs);
  }
  return NextResponse.json({ ok: true, targeted: targets.length, sent, failed, byError });
}
