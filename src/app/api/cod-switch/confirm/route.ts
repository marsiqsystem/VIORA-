// POST /api/cod-switch/confirm
//   { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
//   -> { ok, paid? }  — verifies the payment and switches the Wix order to prepaid.

import { NextRequest, NextResponse } from "next/server";
import { confirmCodSwitch } from "@/lib/codSwitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const clean = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }

  const input = {
    orderGuid: clean(body?.orderId),
    razorpayOrderId: clean(body?.razorpay_order_id),
    razorpayPaymentId: clean(body?.razorpay_payment_id),
    razorpaySignature: clean(body?.razorpay_signature),
  };
  if (Object.values(input).some((v) => !v)) {
    return NextResponse.json({ ok: false, error: "Missing payment fields" }, { status: 400 });
  }

  try {
    const result = await confirmCodSwitch(input);
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (err: any) {
    console.error("[cod-switch] confirm failed:", err);
    return NextResponse.json({ ok: false, error: "Could not confirm the payment" }, { status: 500 });
  }
}
