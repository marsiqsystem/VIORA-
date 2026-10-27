// Checkout eligibility probe for the "₹75 photo-review voucher" (PHOTO75).
//
//   POST /api/review-reward/check   body: { phone?, email? }
//     -> { eligible: boolean, code?, amount?, minimum? }
//
// Called from the browser by useReviewVoucher as the shopper types their phone
// and email at checkout, so it needs NO secret (it only reveals whether THAT
// exact phone/email has an unused voucher — you already have to know both). The
// reward itself was granted server-side when the customer posted a photo review
// (see reviewCapture -> grantReviewReward). Fail-closed: any error => not
// eligible, so a KV blip can never hand out a discount by mistake.

import { NextRequest, NextResponse } from "next/server";
import { getReviewReward } from "@/lib/crm/reviewReward";
import { REVIEW_REWARD } from "@/lib/checkoutPricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ eligible: false });
  }

  const phone = String(body?.phone || "").trim();
  const email = String(body?.email || "").trim();
  if (!phone && !email) return NextResponse.json({ eligible: false });

  try {
    const reward = await getReviewReward({ phone, email });
    if (!reward) return NextResponse.json({ eligible: false });
    return NextResponse.json({
      eligible: true,
      code: REVIEW_REWARD.code,
      amount: REVIEW_REWARD.amount,
      minimum: REVIEW_REWARD.minimum,
    });
  } catch (err) {
    console.error("[review-reward/check] lookup failed:", (err as any)?.message || err);
    return NextResponse.json({ eligible: false });
  }
}
