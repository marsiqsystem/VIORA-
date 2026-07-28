// Wix -> WhatsApp automation (Workflow 5, abandoned cart). STATELESS.
//
// Ported from whatsapp-crm/routes/wixAbandoned.js. Point your Wix
// "Abandoned Checkout" automation at:  https://<site>/api/wix-abandoned

import { NextRequest, NextResponse } from "next/server";
import { extractAbandonedInfo } from "@/lib/crm/wixOrder";
import * as notify from "@/lib/crm/notify";
import T from "@/lib/crm/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const expected = process.env.WIX_WEBHOOK_SECRET;
  if (expected && req.headers.get("x-wix-secret") !== expected) {
    console.warn("[wix-abandoned] rejected: bad or missing x-wix-secret");
    return new NextResponse(null, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }

  try {
    const info = extractAbandonedInfo(body, process.env.DEFAULT_COUNTRY_CODE || "91");
    console.log(
      `[wix-abandoned] phone=${info.phone || "(none)"} name=${info.customerName} ` +
        `product="${info.product || "-"}" value=${info.value || "-"} ` +
        `cart=${info.cartToken || info.cartUrl || "-"}`
    );

    if (!info.phone) {
      console.warn("[wix-abandoned] no usable phone — skipping.");
      return new NextResponse(null, { status: 200 });
    }

    // The URL button {{1}} suffix: prefer a short token; fall back to the URL.
    const cartToken = info.cartToken || info.cartUrl;

    const result: any = await notify.sendAbandonedCart({
      phone: info.phone,
      name: info.customerName,
      product: info.product || "your cart",
      amount: info.value || "",
      cartToken,
    });

    if (result.ok && !result.dryRun) console.log(`[wix-abandoned] WF5 ${T.abandonedCart.name} sent.`);
    else if (result.dryRun) console.log("[wix-abandoned] WF5 DRY RUN.");
    else console.error("[wix-abandoned] WF5 FAILED:", result.error || result.data);
  } catch (err) {
    console.error("[wix-abandoned] processing error:", err);
  }
  return new NextResponse(null, { status: 200 });
}
