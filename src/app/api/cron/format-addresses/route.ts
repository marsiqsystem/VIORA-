// Automatic ship-address enhancement sweep (Vercel Cron — see vercel.json).
//
// Every order's address is AI-enhanced the moment it lands (the Wix webhook does
// an instant per-order format on ingestion). This cron is the SAFETY NET behind
// that: once an hour it sweeps every still-to-ship order through the same address
// pipeline with apply=TRUE, so anything the instant pass missed (a cold/failed AI
// call, an order that arrived some other way) still gets cleaned — no manual step,
// no dashboard button. SHIP-verdict addresses are written (original kept in
// originalAddress for recovery); anything the AI still can't make deliverable is
// left flagged for the Call Queue. Fully idempotent — an already-clean order is
// just re-checked, not reshaped.
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; we require it when the
// secret is configured so nobody else can trigger the sweep.

import { NextRequest, NextResponse } from "next/server";
import { sweepShipQueue } from "@/lib/crm/addressPipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const { counts } = await sweepShipQueue({ apply: true });
    console.log("[cron/format-addresses]", JSON.stringify(counts));
    return NextResponse.json({ ok: true, counts });
  } catch (err: any) {
    console.error("[cron/format-addresses] error:", err?.message || err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

// Vercel Cron issues a GET; POST kept so the sweep can also be kicked manually.
export const GET = run;
export const POST = run;
