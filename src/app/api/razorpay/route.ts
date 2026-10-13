import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { savePending } from "@/lib/crm/rzpPending";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { amount, currency = "INR", receipt, notes } = body || {};
    // Optional snapshot of the cart + delivery details, so a `payment.captured`
    // webhook can rebuild this order if the browser never finishes creating it
    // (the orphan-payment fix). Purely additive — absence just disables the
    // webhook fallback for this order.
    const pending = body?.pending;

    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return NextResponse.json(
        { error: "Invalid amount" },
        { status: 400 }
      );
    }

    const keyId =
      process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json(
        { error: "Razorpay credentials not configured" },
        { status: 500 }
      );
    }

    const instance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const order = await instance.orders.create({
      amount: Math.round(numericAmount * 100),
      currency,
      receipt: receipt || `viora_${Date.now()}`,
      notes: notes || {},
    });

    // Stash the cart + delivery snapshot keyed by the Razorpay order id. The
    // webhook reads this if the client never completes the order. Best-effort:
    // a KV failure must NOT break payment order creation.
    if (pending && (Array.isArray(pending.items) ? pending.items.length : false)) {
      await savePending(order.id, {
        items: pending.items,
        details: pending.details || {},
        amount: numericAmount,
        notes: notes || {},
        createdAt: Date.now(),
      });
    }

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: keyId,
    });
  } catch (err: any) {
    console.error("Razorpay create order failed:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to create order" },
      { status: 500 }
    );
  }
}
