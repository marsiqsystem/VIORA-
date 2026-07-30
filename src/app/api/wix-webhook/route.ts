// Wix -> WhatsApp automation (Workflow 1, order placed). STATELESS.
//
// Ported from whatsapp-crm/routes/wixWebhook.js. Point your Wix Automation
// ("Send via webhook") at:  https://<site>/api/wix-webhook
//
// Flow: parse order -> create Velocity shipment (AWB) -> push tracking back to
// Wix -> send WF1 order_confirmation_v1 (idempotent via a Wix order flag).
// We AWAIT the work before acking (Vercel has no reliable after-response work).

import { NextRequest, NextResponse } from "next/server";
import { extractOrderInfo } from "@/lib/crm/wixOrder";
import * as velocity from "@/lib/crm/velocity";
import * as wix from "@/lib/crm/wix";
import * as notify from "@/lib/crm/notify";
import { config as whatsappCfg } from "@/lib/crm/whatsapp";
import T from "@/lib/crm/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WF1_FLAG = "wa_wf1_sent";

export async function POST(req: NextRequest) {
  const expected = process.env.WIX_WEBHOOK_SECRET;
  if (expected && req.headers.get("x-wix-secret") !== expected) {
    console.warn("[wix-webhook] rejected: bad or missing x-wix-secret");
    return new NextResponse(null, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }

  // Opt-in diagnostics: POST with ?debug=<CRON_SECRET> to get a JSON summary of
  // exactly what the handler did (extracted phone, whether the send was live /
  // dry-run / failed) instead of a silent 200. Never exposed without the secret.
  const debug =
    !!process.env.CRON_SECRET &&
    req.nextUrl.searchParams.get("debug") === process.env.CRON_SECRET;

  const trace: any = { build: "wix-sdk-v2", steps: [] };
  try {
    await processOrder(body, trace);
  } catch (err: any) {
    console.error("[wix-webhook] processing error:", err);
    trace.error = err?.message || String(err);
  }
  if (debug) return NextResponse.json({ ok: true, trace });
  return new NextResponse(null, { status: 200 });
}

async function processOrder(body: any, trace: any = { steps: [] }) {
  const info = extractOrderInfo(body, process.env.DEFAULT_COUNTRY_CODE || "91");
  trace.extracted = {
    orderId: info.orderId,
    phone: info.phone || null,
    name: info.customerName,
    amount: info.amount || null,
    product: info.product || null,
    paymentMode: info.paymentMode,
  };
  // Surface how the running deployment actually parsed the send gate — this is
  // the single most useful diagnostic (true = will send, false = dry-run).
  trace.whatsappSendEnabled = whatsappCfg().sendEnabled;
  console.log(
    `[wix-webhook] order=${info.orderId} phone=${info.phone || "(none)"} ` +
      `name=${info.customerName} amount=${info.amount || "-"} pay=${info.paymentMode} ` +
      `product="${info.product || "-"}"`
  );

  if (!info.amount || !info.product || process.env.WIX_WEBHOOK_LOG_RAW === "true") {
    console.warn(
      "[wix-webhook] missing amount/product — RAW payload for mapping:\n" +
        JSON.stringify(body, null, 2)
    );
  }

  if (!info.orderId) {
    console.warn("[wix-webhook] no order id — skipping.");
    trace.steps.push("skipped: no order id");
    return;
  }

  const order: any = {
    orderId: info.orderId,
    orderGuid: info.orderGuid,
    phone: info.phone,
    name: info.customerName,
    email: info.email,
    product: info.product,
    productId: info.productId,
    productImage: info.productImage,
    sku: info.sku,
    items: info.items,
    amount: info.amount,
    paymentMode: info.paymentMode,
    address: info.address,
  };

  wix.ensureMockOrder(order);

  // The GUID is what every Wix API call keys on (fulfillment write, order fetch,
  // flag write); the human number is only for display. Fall back to the number.
  const wixKey = info.orderGuid || info.orderId;

  // 3) Velocity — CREATE-ONLY by default (no auto-ship).
  // Velocity's own Wix connector auto-imports the order into its "new orders"
  // list (its own IQ- number sequence). The user assigns the courier + ships
  // MANUALLY there. We deliberately do NOT call the create+ship orchestration
  // endpoint from here: it generated an AWB and deducted the wallet (shipping +
  // COD charges) on every order, which the user does not want. Our webhook's
  // only job is the WhatsApp confirmation below.
  // Set VELOCITY_SHIP_ON_ORDER=true to restore automatic shipment creation.
  if (String(process.env.VELOCITY_SHIP_ON_ORDER).toLowerCase() === "true") {
    const ship: any = await velocity.createShipment(order);
    if (ship.ok && ship.awb) {
      // 4) Write tracking back into Wix — the storefront reads it from there.
      await wix.pushTracking(wixKey, { awb: ship.awb, trackingUrl: ship.trackingUrl });
      order.awb = ship.awb;
      order.trackingUrl = ship.trackingUrl;
      console.log(`[wix-webhook] tracking pushed to Wix: awb=${ship.awb}`);
    } else if (!ship.ok) {
      console.error("[wix-webhook] Velocity shipment failed:", ship.error);
    }
  } else {
    console.log(
      "[wix-webhook] Velocity auto-ship disabled (create-only) — Velocity's Wix connector handles order creation; user ships manually."
    );
  }

  if (!info.phone) {
    console.warn("[wix-webhook] no usable phone — WhatsApp skipped.");
    trace.steps.push("skipped: no usable phone");
    return;
  }

  // 5) WF1 with Wix-flag idempotency.
  // Idempotency is BEST-EFFORT: a Wix read/write failure must NEVER block the
  // customer's WhatsApp confirmation. If we can't read the flag, we send anyway
  // — a rare double-send on a webhook retry is far better than never sending.
  // (Root cause this guards: raw Wix REST getOrder was throwing a 400 and taking
  // the whole handler down before the send.)
  let current: any = order;
  try {
    current = (await wix.getOrder(wixKey)) || order;
  } catch (e: any) {
    console.warn(
      "[wix-webhook] getOrder failed — sending WF1 without idempotency check:",
      e?.message || e
    );
    trace.steps.push(`wix getOrder failed (${e?.message || e}) — proceeding to send anyway`);
  }
  if (wix.getFlag(current, WF1_FLAG)) {
    console.log(`[wix-webhook] ${WF1_FLAG} already set for ${info.orderId} — skip WF1.`);
    trace.steps.push("skipped: WF1 flag already set (idempotent)");
    return;
  }

  const result: any = await notify.sendOrderConfirmation(order);
  trace.send = {
    ok: !!result.ok,
    dryRun: !!result.dryRun,
    id: result?.data?.messages?.[0]?.id || null,
    error: result.error ? String(result.error?.message || result.error) : null,
    status: result.status || null,
  };
  if (result.ok && !result.dryRun) {
    // Flag write is also best-effort — the send already succeeded; a Wix write
    // failure here must not turn a delivered message into a crash/retry.
    try {
      await wix.setFlag(wixKey, WF1_FLAG);
    } catch (e: any) {
      console.warn("[wix-webhook] setFlag failed (message already sent):", e?.message || e);
      trace.steps.push("WF1 sent but setFlag failed (idempotency not recorded)");
    }
    console.log(`[wix-webhook] WF1 ${T.orderConfirmation.name} sent.`);
    trace.steps.push("WF1 sent (live)");
  } else if (result.dryRun) {
    console.log("[wix-webhook] WF1 DRY RUN (flag not set).");
    trace.steps.push("WF1 DRY RUN — send gate is OFF in this deployment");
  } else {
    console.error("[wix-webhook] WF1 FAILED:", result.error || result.data);
    trace.steps.push("WF1 FAILED — see trace.send.error");
  }
}
