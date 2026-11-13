// Admin route: manually CREDIT Viora Coins to a customer's wallet.
//
//   POST /api/admin/grant-coins   (x-inbox-key: INBOX_SECRET)
//   { "orderId":"11038", "amount"?:75, "reason"?:"review" }
//   { "contactId":"<wix-id>", "amount"?:75, "reason"?:"review" }
//
// WHY: coins are normally earned by server-verified events (website review,
// first login, prepaid placed, COD delivered). When a customer leaves a review
// out-of-band (e.g. a website enquiry / WhatsApp text we post by hand via
// /api/admin/post-review), there is no automatic grant — this credits the coins.
//
// The wallet is keyed by the Wix member id (contactId). Pass it directly, or an
// orderId we resolve the buyer's contactId from. Crediting is idempotent per
// reasonKey (default "review:<contactId>" — the SAME key the website review path
// uses, so a customer can never be double-granted review coins). amount defaults
// to the standard review reward (75). No-op unless COINS_ENABLED=1 on the server.
//
// Protected by INBOX_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import { earn, coinsEnabled } from "@/lib/crm/vioraCoins";
import { VIORA_COINS } from "@/lib/checkoutPricing";
import * as wix from "@/lib/crm/wix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* query only */ }
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  if (!authOk(body?.key ?? keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!coinsEnabled()) return NextResponse.json({ ok: false, error: "COINS_ENABLED is not 1 on the server" }, { status: 503 });

  const orderId = String(body?.orderId ?? "").trim();
  let contactId = String(body?.contactId ?? "").trim();
  // amount defaults to the standard review reward (75). Accept an explicit number.
  const amount = Number(body?.amount) > 0 ? Math.round(Number(body.amount)) : VIORA_COINS.review;
  // reason -> reasonKey. "review" (default) maps to the canonical, once-per-account
  // "review:<contactId>" so this can't double-grant with the website review path.
  const reason = String(body?.reason ?? "review").trim() || "review";

  // Resolve the buyer's Wix contactId from the order when not passed directly.
  if (!contactId && orderId) {
    try {
      const order: any = await wix.findOrderByNumber(orderId);
      contactId = order?.contactId || "";
    } catch { /* leave empty -> error below */ }
  }
  if (!contactId) {
    return NextResponse.json({ ok: false, error: "could not resolve contactId (pass contactId or a valid orderId with a buyer contact)" }, { status: 422 });
  }

  const reasonKey = reason === "review" ? `review:${contactId}` : `${reason}:${contactId}`;
  const res = await earn({ contactId, amount, reasonKey, note: `Admin grant (${reason})` });

  return NextResponse.json({
    ok: true,
    contactId,
    requestedAmount: amount,
    earned: res.earned,          // false if this reasonKey was already credited
    credited: res.earned ? res.amount : 0,
    balance: res.balance,
    reasonKey,
  });
}
