// Weekly Viora Coins balance reminder (Vercel Cron — see vercel.json).
//
// Delegates to /api/admin/coins-holders?send=1, which scans KV coins:bal:* for every
// holder with a positive balance, resolves name/phone via Wix Contacts, and sends the
// Meta-approved coins_reminder_v1 template. That endpoint already dedupes per holder
// for 60 days (claim-before-send), so a WEEKLY tick only reaches NEW holders + anyone
// past the 60-day window — it can never re-spam someone. Timed-out ticks are
// self-healing: only actually-sent holders get the 60-day claim, so the next tick
// continues with whoever is still unreminded.
//
// FLAG-GATED: does nothing unless COINS_WEEKLY_REMIND=1 is set — safe to ship dark.
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; required when configured.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const enabled = process.env.COINS_WEEKLY_REMIND === "1" || process.env.COINS_WEEKLY_REMIND === "true";
  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: "COINS_WEEKLY_REMIND not enabled" });
  }

  const key = process.env.INBOX_SECRET;
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (!key || !base) {
    return NextResponse.json({ ok: false, error: "INBOX_SECRET or base URL not available" }, { status: 503 });
  }

  // Optional per-tick cap (default: process everyone — the 60-day dedupe keeps it safe).
  const limit = Number(process.env.COINS_WEEKLY_LIMIT || 0);
  const qs = limit > 0 ? `&limit=${limit}` : "";

  try {
    const res = await fetch(`${base}/api/admin/coins-holders?send=1${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, send: 1, ...(limit > 0 ? { limit } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.ok, delegated: "coins-holders", sent: data?.sent, skipped: data?.skipped, failed: data?.failed });
  } catch (err: any) {
    console.error("[cron/coins-remind] error:", err?.message || err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
