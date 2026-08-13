// TEMPORARY admin route: create a UTILITY-category review template.
//
//   POST /api/admin/create-review-util   (x-inbox-key: INBOX_SECRET)
//
// WHY: review_request_v1 is MARKETING, so Meta's per-user marketing frequency
// cap (error 131049 "healthy ecosystem engagement") silently drops it for some
// customers — even though the same numbers receive our UTILITY order/delivered
// templates fine. A UTILITY template (order-specific, no promo) is not frequency
// capped, so it delivers reliably. This submits that template for approval.
//
// Header-less on purpose: an IMAGE header needs a pre-uploaded sample handle at
// creation AND nudges Meta toward MARKETING categorisation. Plain body + a review
// button maximises the odds of a UTILITY approval.
//
// Protected by INBOX_SECRET. DELETE this route after the template is submitted.

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/crm/whatsapp";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NEW_NAME = "review_request_util_v1";

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (!authConfigured()) {
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  }
  if (!authOk(body?.key ?? keyFromRequest(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { token, businessId, version } = config();
  if (!token || !businessId) {
    return NextResponse.json({ ok: false, error: "WHATSAPP token / business id not configured." }, { status: 503 });
  }

  // Utility-framed body: strictly a follow-up on THIS order, no promotional
  // wording/offers. {{1}} customer name, {{2}} order id — same variable order as
  // review_request_v1, so notify.sendReviewRequest needs no param changes.
  const payload = {
    name: NEW_NAME,
    language: "en",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text:
          "Hi {{1}}, thank you for your order #{{2}} from Viora Jewels. We'd love your feedback on this order — it helps us improve our service. Tap the button below to share a quick review.",
        example: { body_text: [["Priya", "10231"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          {
            type: "URL",
            text: "Leave a review",
            // {{1}} = product slug (same suffix notify.sendReviewRequest already sends).
            url: "https://www.viorajewel.in/{{1}}",
            example: ["https://www.viorajewel.in/royal-heartfall-jewelry-set-blue"],
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${businessId}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status, error: data?.error || data }, { status: 502 });
    }
    return NextResponse.json({ ok: true, created: NEW_NAME, meta: data });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
