// Review-request queue (Workflow 4). Triggered by a Vercel Cron (see vercel.json)
// instead of the old in-process setInterval — serverless has no long-lived timer.
//
// Each tick asks Wix for orders delivered >= REVIEW_DELAY_DAYS ago that don't yet
// carry wa_wf4_sent, sends review_request_v1, and flags them. Durability lives in
// Wix, so a missed tick just gets picked up on the next run.
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; we require it when the
// secret is configured so nobody else can trigger a blast.

import { NextRequest, NextResponse } from "next/server";
import { processDueReviews } from "@/lib/crm/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    await processDueReviews();
  } catch (err) {
    console.error("[cron/reviews] error:", err);
  }
  return NextResponse.json({ ok: true });
}
