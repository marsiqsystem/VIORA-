// Coins holders list + balance-reminder blast (boss ask 2026-11-07).
//
//   GET/POST /api/admin/coins-holders?key=<INBOX_SECRET>
//
// Default = LIST (dry run): scans KV for every coins:bal:* > 0, resolves each Wix
// member id -> name + phone via the Wix Contacts API, and returns the holders
// (sorted by balance) with totals. Nothing is sent.
//
//   &send=1                 -> actually blast the approved coins_reminder_v1
//                              template [{{1}}=name, {{2}}=balance] to each holder.
//   &limit=50&offset=0      -> page the blast (serverless 60s budget — send in
//                              batches; the list is returned paged too).
//   &minBalance=1           -> only holders with at least this many coins (default 1).
//   &force=1                -> ignore the per-member "already reminded" dedupe.
//   &test=<phone>&testCoins=50&testName=there -> send ONE preview to a phone.
//
// The coins balance lives in KV keyed by the Wix member id (contactId); orders
// don't carry it, so phone/name come from Wix Contacts. Protected by INBOX_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest, recordOutbound } from "@/lib/crm/inbox-store";
import { sendTemplate } from "@/lib/crm/whatsapp";
import { wixAdminClientServer } from "@/lib/wixAdminClientServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TEMPLATE = "coins_reminder_v1";
const LANG = "en";
const SENT_PREFIX = "coins:reminder_sent:v1:";
const SENT_TTL_S = 60 * 60 * 24 * 60; // 60 days — don't re-remind the same member within 2 months
const BAL_MATCH = "coins:bal:*";

const bodyText = (name: string, bal: number) =>
  `Hi ${name}, you have ${bal} Viora Coins in your account! 🪙 Use them on your next order to get ₹${bal} OFF — plus earn even more coins with every purchase. Grab yours now!`;

function kvCfg() {
  return {
    url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/$/, ""),
    token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim(),
  };
}
async function kv(args: any[]): Promise<any> {
  const { url, token } = kvCfg();
  if (!url || !token) throw new Error("KV not configured");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`kv HTTP ${res.status}`);
  return data?.result;
}

// Scan every coins:bal:* key, read its balance. Returns [{contactId, balance}].
async function scanBalances(): Promise<{ contactId: string; balance: number }[]> {
  const out: { contactId: string; balance: number }[] = [];
  let cursor = "0";
  let guard = 0;
  do {
    const res = await kv(["SCAN", cursor, "MATCH", BAL_MATCH, "COUNT", "500"]);
    cursor = String(res?.[0] ?? "0");
    const keys: string[] = Array.isArray(res?.[1]) ? res[1] : [];
    if (keys.length) {
      const vals = await kv(["MGET", ...keys]);
      keys.forEach((k, i) => {
        const contactId = k.replace(/^coins:bal:/, "");
        const balance = parseInt(String(vals?.[i] ?? "0"), 10) || 0;
        if (contactId && balance > 0) out.push({ contactId, balance });
      });
    }
  } while (cursor !== "0" && ++guard < 200);
  return out;
}

const normalizePhone = (raw: string): string => {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) d = "91" + d; // bare Indian mobile
  else if (d.length === 11 && d.startsWith("0")) d = "91" + d.slice(1);
  return d;
};

// Resolve a Wix member/contact id -> { name, phone }. Best-effort, never throws.
async function resolveContact(contactId: string): Promise<{ name: string; phone: string }> {
  try {
    const client: any = wixAdminClientServer();
    const r: any = await client.contacts.getContact(contactId);
    const c = r?.contact || r || {};
    const info = c.info || {};
    const first = info?.name?.first || c?.primaryInfo?.first || "";
    const last = info?.name?.last || "";
    const name = [first, last].filter(Boolean).join(" ").trim();
    const phones =
      info?.phones?.items?.map((p: any) => p?.phone || p?.e164Phone || p?.formattedPhone) ||
      (c?.primaryInfo?.phone ? [c.primaryInfo.phone] : []);
    const phone = normalizePhone((phones || []).find(Boolean) || "");
    return { name: name || "there", phone };
  } catch {
    return { name: "there", phone: "" };
  }
}

async function handle(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  let body: any = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { /* query only */ } }
  if (!authOk(body?.key ?? keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const g = (k: string) => body?.[k] ?? sp.get(k);
  const send = g("send") === "1" || g("send") === true;
  const force = g("force") === "1" || g("force") === true;
  const minBalance = Math.max(1, parseInt(String(g("minBalance") ?? "1"), 10) || 1);
  const limit = Math.max(0, parseInt(String(g("limit") ?? "0"), 10) || 0);
  const offset = Math.max(0, parseInt(String(g("offset") ?? "0"), 10) || 0);
  const test = String(g("test") || "").trim();

  // ---- TEST: send one preview to a phone, no scan ----
  if (test) {
    const phone = normalizePhone(test);
    const name = String(g("testName") || "there");
    const coins = parseInt(String(g("testCoins") ?? "50"), 10) || 50;
    const res: any = await sendTemplate({ to: phone, templateName: TEMPLATE, languageCode: LANG, bodyParams: [name, String(coins)] });
    if (res?.ok) { try { await recordOutbound({ to: phone, text: bodyText(name, coins), name, template: TEMPLATE, status: "sent", wamid: res?.data?.messages?.[0]?.id }); } catch { /* best effort */ } }
    return NextResponse.json({ ok: !!res?.ok, mode: "test", phone, sent: !!res?.ok, error: res?.ok ? undefined : res?.error });
  }

  // ---- Scan + resolve holders ----
  let holders: { contactId: string; balance: number }[];
  try {
    holders = await scanBalances();
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `scan failed: ${e?.message || e}` }, { status: 502 });
  }
  holders = holders.filter((h) => h.balance >= minBalance).sort((a, b) => b.balance - a.balance);
  const totalHolders = holders.length;
  const totalCoins = holders.reduce((s, h) => s + h.balance, 0);

  // Resolve names/phones (paged to the window we'll actually show/send).
  const windowed = limit > 0 ? holders.slice(offset, offset + limit) : holders.slice(offset);
  const resolved = [];
  for (const h of windowed) {
    const { name, phone } = await resolveContact(h.contactId);
    resolved.push({ contactId: h.contactId, balance: h.balance, name, phone });
  }

  // ---- LIST (dry run) ----
  if (!send) {
    return NextResponse.json({
      ok: true,
      mode: "list",
      totalHolders,
      totalCoins,
      shown: resolved.length,
      offset,
      withPhone: resolved.filter((r) => r.phone).length,
      holders: resolved,
    });
  }

  // ---- SEND: blast coins_reminder_v1 to each resolved holder with a phone ----
  const results: any[] = [];
  for (const r of resolved) {
    if (!r.phone) { results.push({ contactId: r.contactId, name: r.name, balance: r.balance, skipped: "no-phone" }); continue; }
    const sentKey = `${SENT_PREFIX}${r.contactId}`;
    if (!force) {
      const claimed = await kv(["SET", sentKey, String(Date.now()), "NX", "EX", String(SENT_TTL_S)]);
      if (claimed === null) { results.push({ contactId: r.contactId, phone: r.phone, balance: r.balance, skipped: "already-reminded" }); continue; }
    } else {
      await kv(["SET", sentKey, String(Date.now()), "EX", String(SENT_TTL_S)]);
    }
    const res: any = await sendTemplate({ to: r.phone, templateName: TEMPLATE, languageCode: LANG, bodyParams: [r.name, String(r.balance)] });
    if (res?.ok) {
      try { await recordOutbound({ to: r.phone, text: bodyText(r.name, r.balance), name: r.name, template: TEMPLATE, status: "sent", wamid: res?.data?.messages?.[0]?.id }); } catch { /* best effort */ }
      results.push({ contactId: r.contactId, phone: r.phone, balance: r.balance, sent: true });
    } else {
      // Release the dedupe claim so a retry can re-send a failed one.
      try { await kv(["DEL", sentKey]); } catch { /* ignore */ }
      results.push({ contactId: r.contactId, phone: r.phone, balance: r.balance, sent: false, error: res?.error?.message || res?.error || "send failed" });
    }
  }

  return NextResponse.json({
    ok: true,
    mode: "send",
    totalHolders,
    totalCoins,
    processed: results.length,
    sent: results.filter((r) => r.sent).length,
    skipped: results.filter((r) => r.skipped).length,
    failed: results.filter((r) => r.sent === false).length,
    results,
  });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
