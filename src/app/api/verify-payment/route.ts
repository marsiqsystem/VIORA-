import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Verifies a Razorpay payment signature server-side. The signature is an
// HMAC-SHA256 of `${order_id}|${payment_id}` keyed with the (server-only)
// KEY_SECRET. If it matches what Razorpay sent, the payment is genuine and the
// order can be marked paid. KEY_SECRET must never leave the server.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { verified: false, error: "Missing payment fields" },
        { status: 400 }
      );
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return NextResponse.json(
        { verified: false, error: "Razorpay secret not configured" },
        { status: 500 }
      );
    }

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    // Constant-time comparison to avoid timing side-channels.
    const expectedBuf = Buffer.from(expectedSignature);
    const receivedBuf = Buffer.from(String(razorpay_signature));
    const valid =
      expectedBuf.length === receivedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, receivedBuf);

    if (!valid) {
      // Signature mismatch — do NOT treat this as paid.
      return NextResponse.json(
        { verified: false, error: "Signature mismatch" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      verified: true,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    });
  } catch (err: any) {
    console.error("Razorpay verify failed:", err);
    return NextResponse.json(
      { verified: false, error: err?.message || "Verification failed" },
      { status: 500 }
    );
  }
}
