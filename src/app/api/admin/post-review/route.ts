// Admin route: post a WhatsApp/text review to the site as admin (+ optional coins).
//
//   POST /api/admin/post-review   (x-inbox-key: INBOX_SECRET)
//   { "orderId":"11119", "rating":5, "body":"Better quality product thank you",
//     "authorName":"Rakesh Kumar", "title"?:"", "productId"?:"", "coins"?:false }
//
// WHY: customers often reply to the review-request WhatsApp with plain text (no star
// rating, no photo), which the auto-capture flow can't finalize on its own (it needs a
// rating, and coins need a photo). This lets us post that review by hand: resolve the
// product from the order number, post it as admin via postReviewAsAdmin. Coins are NOT
// granted by default (the system reserves review coins for PHOTO reviews); pass
// coins:true only if you explicitly want to grant them anyway.
//
// Protected by INBOX_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import { postReviewAsAdmin } from "@/lib/crm/reviewAdmin";
import * as wix from "@/lib/crm/wix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* query only */ }
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  if (!authOk(body?.key ?? keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const rating = Math.round(Number(body?.rating ?? 5));
  const reviewBody = String(body?.body ?? "").trim();
  const authorName = String(body?.authorName ?? "").trim() || undefined;
  const title = String(body?.title ?? "").trim() || undefined;
  const orderId = String(body?.orderId ?? "").trim();
  let productId = String(body?.productId ?? "").trim();
  let contactId = String(body?.contactId ?? "").trim();

  if (!reviewBody) return NextResponse.json({ ok: false, error: "body (review text) required" }, { status: 400 });
  if (!(rating >= 1 && rating <= 5)) return NextResponse.json({ ok: false, error: "rating must be 1-5" }, { status: 400 });

  // Resolve product + contact (Wix requires a contact-linked author) from the order.
  let resolvedName = authorName;
  if ((!productId || !contactId) && orderId) {
    try {
      const order: any = await wix.findOrderByNumber(orderId);
      if (!productId) productId = order?.items?.[0]?.productId || order?.productId || "";
      if (!contactId) contactId = order?.contactId || "";
      if (!resolvedName) resolvedName = order?.name || undefined;
    } catch { /* leave empty -> error below */ }
  }
  if (!productId) {
    return NextResponse.json({ ok: false, error: "could not resolve productId (pass productId or a valid orderId)" }, { status: 422 });
  }
  if (!contactId) {
    return NextResponse.json({ ok: false, error: "could not resolve contactId (pass contactId or a valid orderId with a buyer contact)" }, { status: 422 });
  }

  const posted = await postReviewAsAdmin({ productId, contactId, rating, body: reviewBody, authorName: resolvedName, title });
  if (!posted.ok) {
    return NextResponse.json({ ok: false, error: posted.error, productId }, { status: 502 });
  }
  return NextResponse.json({ ok: true, posted: true, reviewId: posted.id, productId, rating, authorName: resolvedName });
}
