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
import * as idempotency from "@/lib/crm/idempotency";
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
  // Masked fingerprint of the Velocity creds AS SEEN BY THIS DEPLOYMENT, so we
  // can compare Vercel's values against the known-good .env without exposing
  // them. userLen should be 13 (+917003939432), passLen 14; a trimLen mismatch
  // means whitespace; a different prefix/suffix/len means a wrong value.
  const vu = process.env.VELOCITY_USERNAME || "";
  const vp = process.env.VELOCITY_PASSWORD || "";
  trace.velocityCreds = {
    userLen: vu.length,
    userTrimLen: vu.trim().length,
    userPrefix: vu.trim().slice(0, 4),
    userSuffix: vu.trim().slice(-2),
    passLen: vp.length,
    passTrimLen: vp.trim().length,
    enabled: String(process.env.VELOCITY_ENABLED).trim().toLowerCase() === "true",
    mock: String(process.env.VELOCITY_MOCK).trim().toLowerCase() === "true",
  };
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

  // 2.5) AUTHORITATIVE payment method + amount.
  // The order_placed webhook body is a SNAPSHOT taken before Razorpay settles and
  // the prepaid ₹50 discount commits, so a prepaid ₹549 order can arrive labelled
  // COD ₹599 — which would make Velocity try to COLLECT cash on an already-paid
  // order (a brand-reputation hit). Re-read the order straight from Wix: its
  // customFields carry the real payment method + paid amount that checkout stamped
  // at creation, so this is correct even mid-settlement. Best-effort — any failure
  // leaves the snapshot values untouched, so this can never break the webhook.
  try {
    const fresh: any = await wix.getOrder(wixKey);
    if (fresh) {
      if (fresh.paymentMode && fresh.paymentMode !== order.paymentMode) {
        console.log(
          `[wix-webhook] payment mode corrected from Wix: ${order.paymentMode} -> ${fresh.paymentMode} (order ${info.orderId})`
        );
        order.paymentMode = fresh.paymentMode;
      }
      if (fresh.amount && fresh.amount !== order.amount) {
        console.log(
          `[wix-webhook] amount corrected from Wix: ${order.amount} -> ${fresh.amount} (order ${info.orderId})`
        );
        order.amount = fresh.amount;
      }
      trace.authoritative = { paymentMode: order.paymentMode, amount: order.amount };
    }
  } catch (e: any) {
    console.warn("[wix-webhook] authoritative order re-read failed:", e?.message || e);
  }

  // 3) Velocity.
  // DEFAULT = CREATE-ONLY: call Velocity's /forward-order endpoint so the order
  // lands in Velocity's "New Orders" list with NO courier, NO AWB, and NO wallet
  // deduction. The user then picks a courier + ships it MANUALLY in Velocity.
  // (This replaces relying on Velocity's Wix connector, which wasn't importing.)
  //
  // Set VELOCITY_SHIP_ON_ORDER=true to instead auto create+ship via
  // /forward-order-orchestration (assigns courier + AWB + deducts wallet).
  if (String(process.env.VELOCITY_SHIP_ON_ORDER).trim().toLowerCase() === "true") {
    const ship: any = await velocity.createShipment(order);
    if (ship.ok && ship.awb) {
      // Write tracking back into Wix — the storefront reads it from there.
      await wix.pushTracking(wixKey, { awb: ship.awb, trackingUrl: ship.trackingUrl });
      order.awb = ship.awb;
      order.trackingUrl = ship.trackingUrl;
      console.log(`[wix-webhook] tracking pushed to Wix: awb=${ship.awb}`);
      trace.velocity = { mode: "create+ship", ok: true, awb: ship.awb };
    } else if (!ship.ok) {
      console.error("[wix-webhook] Velocity shipment failed:", ship.error);
      trace.velocity = { mode: "create+ship", ok: false, error: ship.error };
    }
  } else {
    const created: any = await velocity.createOrderOnly(order);
    if (created.ok) {
      console.log(
        `[wix-webhook] Velocity order created (create-only): velocityOrderId=${created.velocityOrderId} shipmentId=${created.shipmentId}`
      );
      trace.velocity = {
        mode: "create-only",
        ok: true,
        dryRun: !!created.dryRun,
        velocityOrderId: created.velocityOrderId,
        shipmentId: created.shipmentId,
      };
    } else {
      console.error("[wix-webhook] Velocity create-order failed:", created.error);
      trace.velocity = { mode: "create-only", ok: false, error: created.error };
    }
  }

  if (!info.phone) {
    console.warn("[wix-webhook] no usable phone — WhatsApp skipped.");
    trace.steps.push("skipped: no usable phone");
    return;
  }

  // 5) WF1 with KV-backed idempotency (claim-before-send).
  // Wix can't hold our dedupe flag (its API rejects extendedFields/customFields
  // writes for this API key), so the marker lives in Vercel KV / Upstash. We
  // atomically CLAIM a per-order key BEFORE sending; a duplicate webhook finds
  // the key already claimed and skips. If the send then fails or is a dry-run,
  // we RELEASE the claim so a legitimate retry can still deliver.
  // FAIL-OPEN: if KV is unconfigured/down, claimOnce reports claimed+degraded so
  // the confirmation still goes out — a missed message is worse than a rare dupe.
  const wf1Key = `${WF1_FLAG}:${info.orderId}`;
  const claim = await idempotency.claimOnce(wf1Key);
  if (!claim.claimed) {
    console.log(`[wix-webhook] WF1 already claimed for ${info.orderId} — skip (idempotent).`);
    trace.steps.push("skipped: WF1 already sent (KV idempotent)");
    return;
  }
  if (claim.degraded) {
    trace.steps.push("KV idempotency unavailable — proceeding without dedupe (fail-open)");
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
    console.log(`[wix-webhook] WF1 ${T.orderConfirmation.name} sent.`);
    trace.steps.push("WF1 sent (live)");
  } else {
    // The guarded action did NOT deliver (dry-run or failure) — release the
    // claim so re-firing (or flipping the send gate on) can send later.
    await idempotency.release(wf1Key);
    if (result.dryRun) {
      console.log("[wix-webhook] WF1 DRY RUN (claim released).");
      trace.steps.push("WF1 DRY RUN — send gate is OFF in this deployment");
    } else {
      console.error("[wix-webhook] WF1 FAILED:", result.error || result.data);
      trace.steps.push("WF1 FAILED — see trace.send.error");
    }
  }
}
