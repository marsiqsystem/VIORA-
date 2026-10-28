// WhatsApp-native review capture (Workflow 4b). After a review request goes out,
// the customer can reply right in WhatsApp with a rating (1-5), a few words, and
// a photo — and we post it to the website as admin, then grant them a ₹75 photo-
// review voucher that auto-applies at their next checkout.
//
// The pieces may arrive across several messages (rating in one, photo in the
// next), so we ACCUMULATE a draft keyed by phone (inbox-store) and only finalise
// once we have enough. A photo is REQUIRED to earn the voucher (anti-farming);
// the review itself still posts without one if the customer opts to SKIP it.
//
// Entirely gated by REVIEW_CAPTURE_ENABLED (default OFF): while off, no drafts are
// created and inbound replies flow to the normal AI path untouched. Never throws.

import { sendText } from "./whatsapp";
import {
  recordOutbound,
  getReviewDraft,
  setReviewDraft,
  clearReviewDraft,
} from "./inbox-store";
import { getOrder, findLatestOrderByPhone } from "./orders-store";
import { uploadWhatsAppPhotoToWix, postReviewAsAdmin } from "./reviewAdmin";
import { earn as earnCoins, coinsEnabled } from "./vioraCoins";
import { VIORA_COINS } from "@/lib/checkoutPricing";

export function isReviewCaptureEnabled() {
  return String(process.env.REVIEW_CAPTURE_ENABLED).toLowerCase() === "true";
}

// --- parsing helpers ---------------------------------------------------------

const WORD_RATINGS = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5,
};

/** Best-effort 1-5 rating from a message. 0 when none found. */
export function parseRating(s) {
  const text = String(s || "");
  // 1) star emojis / asterisks.
  const stars = (text.match(/[⭐★☆🌟]/gu) || []).length;
  if (stars >= 1) return Math.min(stars, 5);
  // 2) "x/5" or "x out of 5".
  const outOf = text.match(/\b([1-5])\s*(?:\/|out of)\s*5\b/i);
  if (outOf) return Number(outOf[1]);
  // 3) a standalone 1-5.
  const lone = text.match(/(?:^|\s)([1-5])(?=$|\s|[.!,])/);
  if (lone) return Number(lone[1]);
  // 4) number words (en + a little hinglish).
  for (const [w, n] of Object.entries(WORD_RATINGS)) {
    if (new RegExp(`\\b${w}\\b`, "i").test(text)) return n;
  }
  return 0;
}

/** Real words, beyond a bare rating token (so "5" alone isn't treated as a body). */
function hasWords(s) {
  const stripped = String(s || "")
    .replace(/[⭐★☆🌟]/gu, " ")
    .replace(/\b([1-5])\s*(?:\/|out of)\s*5\b/gi, " ")
    .replace(/\b(star|stars|rating)\b/gi, " ");
  const letters = (stripped.match(/[A-Za-zऀ-ॿ]/g) || []).length;
  return letters >= 3;
}

const SKIP_RE = /\b(skip|no photo|without photo|no pic|post it|done|bina photo)\b/i;

// --- send helper -------------------------------------------------------------

async function reply(to, body) {
  const sent = await sendText({ to, body });
  await recordOutbound({
    to, text: body, wamid: sent?.data?.messages?.[0]?.id,
    status: sent?.dryRun ? "pending" : "sent",
  });
  return sent;
}

// --- public API --------------------------------------------------------------

/**
 * Open a review-capture window for a phone (called right after a review request
 * is sent). No-op while the feature is off. Never throws.
 */
export async function beginReviewCapture(phone, orderId) {
  if (!isReviewCaptureEnabled() || !phone || !orderId) return;
  try {
    await setReviewDraft(phone, { orderId: String(orderId), active: false, startedAt: Date.now() });
  } catch (e) {
    console.warn("[reviewCapture] beginReviewCapture failed:", e?.message || e);
  }
}

/**
 * Handle one inbound message as a possible review reply. Returns true when it
 * consumed the message (caller then skips the AI path), false to let it flow on.
 * Never throws.
 */
export async function handleReviewReply(msg) {
  if (!isReviewCaptureEnabled()) return false;
  const phone = msg?.from;
  if (!phone) return false;

  let draft;
  try { draft = await getReviewDraft(phone); } catch { draft = null; }
  if (!draft) return false;

  const textRaw = [msg.caption, msg.text].filter(Boolean).join(" ").trim();
  const rating = parseRating(textRaw);
  const words = hasWords(textRaw) ? textRaw : "";
  const photoId = msg.imageId || "";

  // Before the customer has given any clear review signal, don't hijack a plain
  // message (it might be an unrelated question) — let it flow to the AI path.
  if (!draft.active && !rating && !photoId && !SKIP_RE.test(textRaw)) {
    return false;
  }

  // Merge this message into the draft (non-destructive).
  draft.active = true;
  if (rating) draft.rating = rating;
  if (words) draft.body = words;
  if (photoId) draft.photoMediaId = photoId;

  const skip = SKIP_RE.test(textRaw) && draft.rating;

  // Decide what's still missing. A photo is required for the ₹75 reward; the
  // review can still post without one if the customer says SKIP.
  const needPhoto = !draft.photoMediaId && !skip;
  const needRating = !draft.rating;
  const needWords = !draft.body;

  if (needRating) {
    await setReviewDraft(phone, draft);
    await reply(phone, "Thanks for your feedback! 🌟 Please reply with a *rating out of 5* (e.g. 5) to add your review.");
    return true;
  }
  if (needPhoto) {
    await setReviewDraft(phone, draft);
    await reply(
      phone,
      `Great, a ${draft.rating}-star review! 📸 Now send a *photo* of your piece to earn *${VIORA_COINS.review} Viora Coins* (₹${VIORA_COINS.review} off your next order).\n\n(Or reply *SKIP* to post your review without a photo.)`
    );
    return true;
  }
  if (needWords) {
    await setReviewDraft(phone, draft);
    await reply(phone, "Almost done! ✍️ Add a few words about your piece and we'll post your review.");
    return true;
  }

  // We have enough — finalise.
  await finalize(phone, draft, { withPhoto: !!draft.photoMediaId, msgName: msg.name });
  return true;
}

async function finalize(phone, draft, { withPhoto, msgName }) {
  // Resolve the product to review from the order we remembered (fall back to the
  // customer's latest order by phone).
  let order = null;
  try { order = (draft.orderId && (await getOrder(draft.orderId))) || null; } catch { order = null; }
  if (!order?.productId) {
    try { order = (await findLatestOrderByPhone(phone)) || order; } catch { /* ignore */ }
  }

  const productId = order?.productId || "";
  if (!productId) {
    // Nothing to attach the review to — thank the customer, flag in logs, clear.
    console.warn(`[reviewCapture] no productId for ${phone} (order ${draft.orderId}) — cannot post review.`);
    await clearReviewDraft(phone);
    await reply(phone, "Thank you so much for your review! 💛 Our team will add it shortly.");
    return;
  }

  // Upload the photo (best-effort). If it fails, we still post a text review.
  let mediaUrl = null;
  if (withPhoto && draft.photoMediaId) {
    mediaUrl = await uploadWhatsAppPhotoToWix(draft.photoMediaId, `review-${draft.orderId || "x"}.jpg`);
  }

  const authorName = order?.name || msgName || "Verified buyer";
  const posted = await postReviewAsAdmin({
    productId,
    rating: draft.rating,
    body: draft.body || `${draft.rating}/5`,
    mediaUrl: mediaUrl || undefined,
    authorName,
  });

  if (!posted.ok) {
    console.error(`[reviewCapture] post failed for ${phone}:`, posted.error);
    // Keep the draft so a retry/next message can try again.
    await reply(phone, "Thanks! We hit a snag saving your review — our team will add it shortly. 💛");
    return;
  }

  // Reward a PHOTO review with Viora Coins (1 coin = ₹1, stack at checkout). Coins
  // are member-tied, so we need the buyer's Wix contactId + COINS_ENABLED; a pure
  // guest (no member account) still gets the review posted — just no coins yet.
  let coinsEarned = 0;
  if (mediaUrl && coinsEnabled() && order?.contactId) {
    try {
      const res = await earnCoins({
        contactId: order.contactId,
        amount: VIORA_COINS.review,
        reasonKey: `review:${order.contactId}`,
        note: "WhatsApp photo review",
      });
      if (res?.earned) coinsEarned = res.amount;
    } catch (e) {
      console.warn("[reviewCapture] coin grant failed:", e?.message || e);
    }
  }

  await clearReviewDraft(phone);
  const body = coinsEarned
    ? `🎉 Thank you! Your review is now live on our website.\n\nYou've earned *${coinsEarned} Viora Coins* (₹${coinsEarned} off) — use them on your next order. 💛\n— Team Viora Jewels`
    : `🙏 Thank you! Your review is now live on our website.${mediaUrl ? "" : `\n\nTip: add a *photo* next time to earn *${VIORA_COINS.review} Viora Coins*!`} 💛\n— Team Viora Jewels`;
  await reply(phone, body);
  console.log(`[reviewCapture] review posted for ${phone} on product ${productId} (coins=${coinsEarned}).`);
}
