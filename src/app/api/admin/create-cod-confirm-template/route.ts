// Admin route: create the COD soft-gate confirm template cod_confirm_prepaid_v1.
//
//   POST /api/admin/create-cod-confirm-template   (x-inbox-key: INBOX_SECRET)
//
// WHY: the COD soft-gate (carrierEngine.codSoftGateFires + notify.sendCodConfirm)
// sends a FIRMER confirmation to COD orders shipping into high-RTO states — they
// still ship, but the customer is asked to actively ✅ Confirm (which cuts RTO) and
// is reminded they can pay online for faster delivery. This submits that template
// for Meta approval. UTILITY + header-less + order-specific wording to maximise the
// odds of a UTILITY (non-frequency-capped, reliable) approval.
//
// The ✅ Confirm / ❌ Cancel quick-replies reuse the exact taps autoReply already
// classifies (button text contains "confirm"/"cancel"), so no handler changes.
//
// Protected by INBOX_SECRET. Safe to re-run (Meta rejects a duplicate name).
// DELETE this route once the template is approved.

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/crm/whatsapp";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NEW_NAME = "cod_confirm_prepaid_v1";

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

  // {{1}} name, {{2}} order id, {{3}} product, {{4}} COD amount — same order
  // notify.sendCodConfirm sends. Utility-framed: confirms THIS order, no promo/offer.
  const payload = {
    name: NEW_NAME,
    language: "en",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text:
          "Hi {{1}}, your Viora order #{{2}} for {{3}} (COD {{4}}) is confirmed. " +
          "Deliveries to your area sometimes face issues, so please tap *Confirm* below so we dispatch it right away, " +
          "or *Cancel* if you've changed your mind. You can also pay online anytime for faster, contactless delivery. " +
          "— Team Viora Jewels",
        example: { body_text: [["Priya", "11231", "Rosa Blush Jewellery Set", "₹1,116"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "QUICK_REPLY", text: "Confirm" },
          { type: "QUICK_REPLY", text: "Cancel" },
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
