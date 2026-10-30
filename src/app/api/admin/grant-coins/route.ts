// TEMP admin route — grant / check Viora Coins for a member by email, for the
// go-live money-path test. Protected by INBOX_SECRET. DELETE after the coins
// live-test is signed off.
//
//   GET  /api/admin/grant-coins?key=<INBOX_SECRET>&email=<e>                 -> resolve + balance
//   POST /api/admin/grant-coins   { key, email, amount }                     -> credit `amount` coins
//
// Resolves the member the SAME way checkout does (contactId = the wallet key),
// so the balance we grant here is the balance the checkout will spend.

import { NextRequest, NextResponse } from "next/server";
import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { members } from "@wix/members";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import { earn as earnCoins, getBalance as getCoinsBalance, coinsEnabled } from "@/lib/crm/vioraCoins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIX_API_KEY = process.env.WIX_API_KEY;
const WIX_SITE_ID = process.env.WIX_SITE_ID;

// Resolve a member by login email to the SAME id checkout keys the wallet on:
// contactId when available, else the member _id.
async function resolveContactId(email: string): Promise<{ contactId: string; memberId: string } | null> {
  if (!WIX_API_KEY || !WIX_SITE_ID) throw new Error("WIX_API_KEY / WIX_SITE_ID not set");
  const admin = createClient({
    modules: { members },
    auth: ApiKeyStrategy({ apiKey: WIX_API_KEY, siteId: WIX_SITE_ID }),
  });
  const found = await admin.members.queryMembers().eq("loginEmail", email.toLowerCase()).find();
  const memberId = found.items?.[0]?._id;
  if (!memberId) return null;
  let contactId = (found.items?.[0] as any)?.contactId || "";
  if (!contactId) {
    try {
      const full: any = await (admin.members as any).getMember(memberId, { fieldsets: ["FULL"] });
      const m = full?.member || full;
      contactId = m?.contactId || "";
    } catch {
      /* fall back to memberId below */
    }
  }
  return { contactId: contactId || memberId, memberId };
}

export async function GET(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const email = (req.nextUrl.searchParams.get("email") || "").trim();
  if (!email) return NextResponse.json({ ok: false, error: "email required" }, { status: 400 });
  try {
    const resolved = await resolveContactId(email);
    if (!resolved) return NextResponse.json({ ok: false, error: "no member for that email" }, { status: 404 });
    const balance = await getCoinsBalance(resolved.contactId);
    return NextResponse.json({ ok: true, coinsEnabled: coinsEnabled(), email, ...resolved, balance });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (!authOk(body?.key || keyFromRequest(req)))
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const email = String(body?.email || "").trim();
  const amount = Math.round(Number(body?.amount) || 0);
  if (!email || amount <= 0)
    return NextResponse.json({ ok: false, error: "email and positive amount required" }, { status: 400 });
  if (!coinsEnabled())
    return NextResponse.json({ ok: false, error: "COINS_ENABLED is not 1 — flip the flag first" }, { status: 409 });
  try {
    const resolved = await resolveContactId(email);
    if (!resolved) return NextResponse.json({ ok: false, error: "no member for that email" }, { status: 404 });
    // Unique reasonKey so a test grant always credits (earn is idempotent per key).
    const res = await earnCoins({
      contactId: resolved.contactId,
      amount,
      reasonKey: `admintest:${resolved.contactId}:${Date.now()}`,
      note: "Test grant",
    });
    return NextResponse.json({ ok: true, email, ...resolved, granted: res.earned ? res.amount : 0, balance: res.balance });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
