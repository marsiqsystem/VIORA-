// TEMP admin route — send the order_confirmation_v2 template to ONE number so we
// can eyeball EXACTLY what a customer receives (image header, 8 body fields, the
// smart address-check line, and the ✅/❌/✏️ quick-reply buttons) BEFORE flipping
// the live TPL_ORDER_CONFIRMATION env for everyone.
//
//   GET /api/admin/test-confirm-v2?key=<INBOX_SECRET>&to=9198XXXXXXXX[&order=10955]
//
// With ?order= it builds the real params for that order (real address + real
// smart-check), so the preview is faithful. Without it, a representative sample.
// It never flips any env and never touches the order. Delete this file after the
// preview check.

import { NextRequest, NextResponse } from "next/server";
import { sendTemplate } from "@/lib/crm/whatsapp";
import { buildConfirmV2Params } from "@/lib/crm/notify";
import { recordOutbound, authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";
import T from "@/lib/crm/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const to = (sp.get("to") || "").replace(/[^\d]/g, "");
  const orderId = (sp.get("order") || "").trim();
  if (!to) return NextResponse.json({ ok: false, error: "to required (e.g. 9198XXXXXXXX)" }, { status: 400 });

  // Build the order object the params come from: the real order if given, else a
  // representative sample that exercises the address + smart-check logic.
  let order: any;
  if (orderId) {
    order = await ordersStore.getOrder(orderId);
    if (!order) return NextResponse.json({ ok: false, error: `order ${orderId} not found` }, { status: 404 });
  } else {
    order = {
      name: "Preview Customer",
      orderId: "PREVIEW",
      product: "Rosa Blush Pendant",
      colour: "Rose Gold",
      qty: 1,
      amount: 528,
      paymentMode: "COD",
      address: {
        line1: "12 Sample Residency, 2nd Cross",
        line2: "Indiranagar",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560038",
      },
    };
  }

  const bodyParams = await buildConfirmV2Params(order);
  const headerImageUrl = order.productImage || (T as any).orderConfirmation.headerImageUrl;

  const res: any = await sendTemplate({
    to,
    templateName: "order_confirmation_v2",
    languageCode: (T as any).orderConfirmation.lang || "en",
    headerImageUrl,
    bodyParams,
  });

  if (!res?.ok) {
    return NextResponse.json(
      { ok: false, error: res?.error || res?.data?.error || "send failed", sentParams: bodyParams, raw: res },
      { status: 502 }
    );
  }
  const wamid = res?.data?.messages?.[0]?.id;
  try {
    await recordOutbound({ to, text: "📦 order_confirmation_v2 (preview)", wamid, status: "sent", template: true });
  } catch { /* mirror best-effort */ }
  return NextResponse.json({ ok: true, to, order: orderId || "sample", wamid, sentParams: bodyParams });
}
