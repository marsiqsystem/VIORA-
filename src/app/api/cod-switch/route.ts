// Pay online after a COD order (see src/lib/codSwitch.ts).
//
//   GET  /api/cod-switch?orderId=<Wix order GUID>  -> { eligible, payNow?, codTotal? }
//   POST /api/cod-switch  { orderId }             -> Razorpay order for the waived amount

import { NextRequest, NextResponse } from "next/server";
import { createCodSwitchPayment, quoteCodSwitch } from "@/lib/codSwitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cleanId = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function GET(req: NextRequest) {
  const orderId = cleanId(req.nextUrl.searchParams.get("orderId"));
  if (!orderId) return NextResponse.json({ eligible: false, reason: "missing-order" }, { status: 400 });

  const quote = await quoteCodSwitch(orderId);
  // Only the figures the offer card needs.
  return NextResponse.json(
    quote.eligible
      ? { eligible: true, payNow: quote.payNow, codTotal: quote.codTotal }
      : { eligible: false, reason: quote.reason }
  );
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const orderId = cleanId(body?.orderId);
  if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

  try {
    const result = await createCodSwitchPayment(orderId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[cod-switch] create payment failed:", err);
    return NextResponse.json({ error: "Could not start the payment" }, { status: 500 });
  }
}
