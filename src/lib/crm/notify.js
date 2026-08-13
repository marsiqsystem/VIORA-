// Workflow dispatch layer: turns an order into the correct WhatsApp template
// call for each of the 5 workflows. This is the ONLY place that knows how our
// order fields line up with each template's {{1}}, {{2}}… variables and button
// suffixes — so if a template's variable order changes, it changes here alone.
//
// Every function returns the sender's result object
// ({ ok, dryRun, ... }) and never throws — callers decide what to do with it
// (record idempotency only on a real send, log on failure, etc.).

import { sendTemplate } from "./whatsapp";
import { recordOutbound } from "./inbox-store";
import { renderTemplateBody } from "./templateText";
import T from "./templates";

/** Normalize a SQLite order row (snake_case) into the shape used below. */
function fromRow(row) {
  return {
    orderId: row.order_id,
    phone: row.phone,
    name: row.name || "Customer",
    product: row.product || "your order",
    amount: row.amount || "",
    paymentMode: row.payment_mode || "",
    awb: row.awb || "",
    trackingUrl: row.tracking_url || "",
  };
}

// Customer-facing payment label. Our order carries "PREPAID" / "COD"; the
// message reads better as words.
const prettyPayment = (m) =>
  String(m || "").toUpperCase() === "PREPAID" ? "Paid Online" : "Cash on Delivery";

// Prefix a bare number with the rupee sign so bubbles read "₹899", but leave a
// value that already carries a currency symbol (or is empty) untouched.
const money = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return /^\d/.test(s) ? `₹${s}` : s;
};

// --- INBOX MIRROR -------------------------------------------------------------
// Each of the 6 automated templates below also gets written into the two-way
// inbox store (`recordOutbound`) so an operator sees the SAME timeline a
// customer sees — order confirmed → out for delivery → delivered → review —
// interleaved with the customer's own replies, exactly like WhatsApp.
//
// The thread stores the REAL approved template body (fetched from Meta by
// `renderTemplateBody` and filled with the params we sent), so it matches what
// the customer received word-for-word. The `render.*` map below is only a
// FALLBACK used if Meta can't be reached — never the primary text.
// Build the customer-facing tracking link from the AWB, matching Velocity's
// track base (same default as lib/crm/velocity.js). Falls back to the site.
// Customer tracking page — the Viora-branded "Powered by Velocity" page at
// www.velocityshipping.in/track/<AWB>. We also rewrite the old wrong hosts
// (shipfast.in and the shipfastt.in typo) in case either is still baked into the
// VELOCITY_TRACK_URL_BASE env var, so tracking links work without an env edit.
const TRACK_BASE = (process.env.VELOCITY_TRACK_URL_BASE || "https://www.velocityshipping.in/track")
  .replace(/https?:\/\/(www\.)?shipfastt?\.in/gi, "https://www.velocityshipping.in")
  .replace(/\/$/, "");
const trackingLink = (o) =>
  String(o.trackingUrl || "").trim() ||
  (o.awb ? `${TRACK_BASE}/${o.awb}` : "https://viorajewel.in/orders");

const render = {
  orderConfirmation: (o) =>
    `✅ Hi ${o.name}, your Viora order #${o.orderId} for ${money(o.amount)} (${o.paymentMode || "—"}) is confirmed! 💛 Tap *Confirm* to lock it in, or *Cancel* if you've changed your mind.`,
  dispatched: (o) =>
    `🚚 Hi ${o.name}, great news! Your Viora Jewels order #${o.orderId} has been packed and *dispatched* and is on its way to you. Track it here: ${trackingLink(o)} 💎`,
  outForDelivery: (o) =>
    `🚚 Hi ${o.name}, your order #${o.orderId} (${o.product}) worth ${money(o.amount)} is *out for delivery* today! Tap *Track Order* to follow it live.`,
  delivered: (o) =>
    `📦 Hi ${o.name}, your order #${o.orderId} has been *delivered*! We hope you love it 💛`,
  reviewRequest: (o) =>
    `Hi ${o.name}, thank you for your order #${o.orderId} from Viora Jewels. We'd love your feedback on this order — it helps us improve our service. Tap the button below to share a quick review.`,
  abandonedCart: (o) =>
    `🛍️ Hi ${o.name}, you left *${o.product}* (${money(o.amount)}) in your cart. Complete your order before it's gone — tap below to check out!`,
  orderCancelled: (o) =>
    `❌ Hi ${o.name}, your order #${o.orderId} (${o.product}, ${money(o.amount)}, ${prettyPayment(o.paymentMode)}) has been cancelled. If this was a mistake, just reply here and we'll help. 💛`,
};

/**
 * Mirror a successful template send into the inbox thread. Best-effort and
 * fully swallowed — the inbox is a convenience, and a store hiccup must NEVER
 * break (or slow past its own try/catch) the customer message that just sent.
 *
 * Only real, delivered sends are recorded (`res.ok && !res.dryRun`), so the
 * inbox stays truthful — it shows what WhatsApp actually shows, no dry-run or
 * failed sends. The Meta message id enables delivery ticks (sent/delivered/read).
 */
async function logOutbound(phone, text, res, name, imageUrl) {
  try {
    if (!res || res.ok !== true || res.dryRun === true) return;
    const wamid = res?.data?.messages?.[0]?.id;
    // Tag the chat with the real order name — but never with the "Customer"
    // placeholder fromRow() falls back to, which would overwrite a good name.
    const nm = String(name ?? "").trim();
    const cleanName = nm && nm.toLowerCase() !== "customer" ? nm : undefined;
    // A template with an IMAGE header (order confirmation / cancelled) shows the
    // same photo the customer got, with the body text as the caption.
    const url = String(imageUrl ?? "").trim();
    await recordOutbound({
      to: phone,
      text,
      wamid,
      name: cleanName,
      template: true, // every automated notify.js send is an approved template
      ...(url ? { type: "image", imageUrl: url } : {}),
    });
  } catch {
    /* inbox mirror is best-effort; never surface here */
  }
}

// Resolve the REAL approved body text for a template send (falls back to the
// hand-written `render.*` line only if Meta can't be reached).
async function realText(name, lang, params, fallback) {
  const real = await renderTemplateBody(name, lang, params);
  return real || fallback;
}

// Turn a product name into a URL-safe slug for the review-link button suffix.
// Placeholder until we wire the real Wix product slug through the pipeline.
const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// --- Workflow 1: order placed -------------------------------------------------
// {{1}} name, {{2}} order id, {{3}} amount, {{4}} payment mode.
// Confirm/Cancel are static quick replies — no params on send.
async function sendOrderConfirmation(o) {
  const bodyParams = [o.name, o.orderId, o.amount, o.paymentMode];
  const headerImageUrl = o.productImage || T.orderConfirmation.headerImageUrl;
  const res = await sendTemplate({
    to: o.phone,
    templateName: T.orderConfirmation.name,
    languageCode: T.orderConfirmation.lang,
    // The template's IMAGE header: use this order's product photo when we have
    // it, else the Viora logo. (A header image is required — never send empty.)
    headerImageUrl,
    bodyParams,
  });
  const text = await realText(T.orderConfirmation.name, T.orderConfirmation.lang, bodyParams, render.orderConfirmation(o));
  await logOutbound(o.phone, text, res, o.name, headerImageUrl);
  return res;
}

// --- Workflow: order dispatched (fires when Velocity marks it in-transit) ------
// body {{1}} name, {{2}} order id, {{3}} tracking URL. IMAGE header, NO button.
async function sendDispatched(o) {
  const bodyParams = [o.name, o.orderId, trackingLink(o)];
  const headerImageUrl = o.productImage || T.dispatched.headerImageUrl;
  const res = await sendTemplate({
    to: o.phone,
    templateName: T.dispatched.name,
    languageCode: T.dispatched.lang,
    headerImageUrl,
    bodyParams,
  });
  const text = await realText(T.dispatched.name, T.dispatched.lang, bodyParams, render.dispatched(o));
  await logOutbound(o.phone, text, res, o.name, headerImageUrl);
  return res;
}

// --- Workflow 2: out for delivery --------------------------------------------
// IMAGE header ; body {{1}} name, {{2}} order id, {{3}} product, {{4}} amount. NO button.
async function sendOutForDelivery(o) {
  const bodyParams = [o.name, o.orderId, o.product, o.amount];
  const headerImageUrl = o.productImage || T.outForDelivery.headerImageUrl;
  const res = await sendTemplate({
    to: o.phone,
    templateName: T.outForDelivery.name,
    languageCode: T.outForDelivery.lang,
    headerImageUrl,
    bodyParams,
  });
  const text = await realText(T.outForDelivery.name, T.outForDelivery.lang, bodyParams, render.outForDelivery(o));
  await logOutbound(o.phone, text, res, o.name, headerImageUrl);
  return res;
}

// --- Workflow 3: delivered ----------------------------------------------------
// IMAGE header ; body {{1}} name, {{2}} order id.
async function sendDelivered(o) {
  const bodyParams = [o.name, o.orderId];
  const headerImageUrl = o.productImage || T.delivered.headerImageUrl;
  const res = await sendTemplate({
    to: o.phone,
    templateName: T.delivered.name,
    languageCode: T.delivered.lang,
    headerImageUrl,
    bodyParams,
  });
  const text = await realText(T.delivered.name, T.delivered.lang, bodyParams, render.delivered(o));
  await logOutbound(o.phone, text, res, o.name, headerImageUrl);
  return res;
}

// --- Workflow 4: review request (2-3 days post-delivery) ---------------------
// IMAGE header ; body {{1}} name, {{2}} order id ; button url {{1}} product slug.
async function sendReviewRequest(o) {
  const bodyParams = [o.name, o.orderId];
  // review_request_util_v1 (UTILITY) is HEADER-LESS. Only send a header if the
  // configured review template actually has one (keeps this correct if the env
  // is ever pointed back at an image-header template). Sending an image header to
  // a header-less template gives Meta's "header: Format mismatch" error.
  const headerImageUrl = T.reviewRequest.headerImageUrl
    ? o.productImage || T.reviewRequest.headerImageUrl
    : undefined;
  const res = await sendTemplate({
    to: o.phone,
    templateName: T.reviewRequest.name,
    languageCode: T.reviewRequest.lang,
    ...(headerImageUrl ? { headerImageUrl } : {}),
    bodyParams,
    // TODO: pass the real Wix product slug through the store instead of slugifying the name.
    urlButtons: [{ index: "0", param: slugify(o.product) }],
  });
  const text = await realText(T.reviewRequest.name, T.reviewRequest.lang, bodyParams, render.reviewRequest(o));
  await logOutbound(o.phone, text, res, o.name, headerImageUrl);
  return res;
}

// --- Workflow 5: abandoned cart ----------------------------------------------
// IMAGE header ; body {{1}} name, {{2}} product, {{3}} value ; button url {{1}} cart recovery token.
async function sendAbandonedCart(o) {
  const bodyParams = [o.name, o.product, o.amount];
  const headerImageUrl = o.productImage || T.abandonedCart.headerImageUrl;
  const res = await sendTemplate({
    to: o.phone,
    templateName: T.abandonedCart.name,
    languageCode: T.abandonedCart.lang,
    headerImageUrl,
    bodyParams,
    urlButtons: [{ index: "0", param: o.cartToken }],
  });
  const text = await realText(T.abandonedCart.name, T.abandonedCart.lang, bodyParams, render.abandonedCart(o));
  await logOutbound(o.phone, text, res, o.name, headerImageUrl);
  return res;
}

// --- Order cancelled (fired when the order is cancelled in Wix or Velocity) ---
// body {{1}} name, {{2}} order id, {{3}} product, {{4}} amount, {{5}} payment mode.
// One template covers both reasons (customer request / couldn't connect on call);
// the approved body text mentions both, so no reason variable is needed.
async function sendOrderCancelled(o) {
  const bodyParams = [o.name, o.orderId, o.product, o.amount, prettyPayment(o.paymentMode)];
  const headerImageUrl = o.productImage || T.orderCancelled.headerImageUrl;
  const res = await sendTemplate({
    to: o.phone,
    templateName: T.orderCancelled.name,
    languageCode: T.orderCancelled.lang,
    // Same as confirmation: this order's product photo when we have it, else the logo.
    headerImageUrl,
    bodyParams,
  });
  const text = await realText(T.orderCancelled.name, T.orderCancelled.lang, bodyParams, render.orderCancelled(o));
  await logOutbound(o.phone, text, res, o.name, headerImageUrl);
  return res;
}

export {
  fromRow,
  slugify,
  prettyPayment,
  sendOrderConfirmation,
  sendDispatched,
  sendOutForDelivery,
  sendDelivered,
  sendReviewRequest,
  sendAbandonedCart,
  sendOrderCancelled,
};
