// Wix -> WhatsApp "order cancelled" automation. STATELESS.
//
// Point a Wix Automation ("When an order is canceled" -> "Send via webhook") at:
//   https://<site>/api/wix-cancel-webhook
//
// This is the CANCEL counterpart to /api/wix-webhook (which handles order placed).
// It only messages the customer that their order was cancelled — it does NOT touch
// Velocity or tracking. Cancelling in Velocity instead routes through
// /api/velocity-webhook (status CANCELLED); both share one KV dedupe key so the
// customer gets exactly one message.

import { NextRequest, NextResponse } from "next/server";
import { extractOrderInfo } from "@/lib/crm/wixOrder";
import { dispatchCancellationOnce } from "@/lib/crm/cancel";
import { config as whatsappCfg } from "@/lib/crm/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Health check (browser GET). The webhook itself only handles POST.
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "wix-cancel-webhook",
    method: "POST",
    message: "Wix order-cancelled webhook is live. Send cancellations via POST.",
  });
}

export async function POST(req: NextRequest) {
  const expected = process.env.WIX_WEBHOOK_SECRET;
  if (expected && req.headers.get("x-wix-secret") !== expected) {
    console.warn("[wix-cancel-webhook] rejected: bad or missing x-wix-secret");
    return new NextResponse(null, { status: 401 });
  }

  // Opt-in diagnostics: POST with ?debug=<CRON_SECRET> for a JSON summary.
  const debug =
    !!process.env.CRON_SECRET &&
    req.nextUrl.searchParams.get("debug") === process.env.CRON_SECRET;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }

  const trace: any = { build: "wix-cancel-v1", steps: [] };
  try {
    const info = extractOrderInfo(body, process.env.DEFAULT_COUNTRY_CODE || "91");
    trace.extracted = {
      orderId: info.orderId,
      phone: info.phone || null,
      name: info.customerName,
      amount: info.amount || null,
      product: info.product || null,
      paymentMode: info.paymentMode,
    };
    trace.whatsappSendEnabled = whatsappCfg().sendEnabled;
    console.log(
      `[wix-cancel-webhook] order=${info.orderId} phone=${info.phone || "(none)"} ` +
        `name=${info.customerName} product="${info.product || "-"}"`
    );

    if (!info.orderId) {
      trace.steps.push("skipped: no order id");
    } else if (!info.phone) {
      trace.steps.push("skipped: no usable phone");
    } else {
      const order = {
        orderId: info.orderId,
        phone: info.phone,
        name: info.customerName,
        product: info.product,
        productImage: info.productImage,
        amount: info.amount,
        paymentMode: info.paymentMode,
      };
      const res = await dispatchCancellationOnce(order);
      trace.send = res;
      trace.steps.push(res.sent ? "cancellation sent (live)" : `not sent: ${res.reason}`);
    }
  } catch (err: any) {
    console.error("[wix-cancel-webhook] processing error:", err);
    trace.error = err?.message || String(err);
  }

  if (debug) return NextResponse.json({ ok: true, trace });
  return new NextResponse(null, { status: 200 });
}
