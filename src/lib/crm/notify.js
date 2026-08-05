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
// A readable one-line version of each template (Meta only stores the raw
// {{n}} params, so we render the sentence here for display). These are for the
// inbox thread ONLY — the actual approved copy sent to Meta is unchanged.
const render = {
  orderConfirmation: (o) =>
    `✅ Hi ${o.name}, your Viora order #${o.orderId} for ${money(o.amount)} (${o.paymentMode || "—"}) is confirmed! 💛 Tap *Confirm* to lock it in, or *Cancel* if you've changed your mind.`,
  outForDelivery: (o) =>
    `🚚 Hi ${o.name}, your order #${o.orderId} (${o.product}) worth ${money(o.amount)} is *out for delivery* today! Tap *Track Order* to follow it live.`,
  delivered: (o) =>
    `📦 Hi ${o.name}, your order #${o.orderId} has been *delivered*! We hope you love it 💛`,
  reviewRequest: (o) =>
    `⭐ Hi ${o.name}, how was your Viora experience with order #${o.orderId}? Tap below to leave a quick review — it means the world to us! 💛`,
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
async function logOutbound(phone, text, res, name) {
  try {
    if (!res || res.ok !== true || res.dryRun === true) return;
    const wamid = res?.data?.messages?.[0]?.id;
    // Tag the chat with the real order name — but never with the "Customer"
    // placeholder fromRow() falls back to, which would overwrite a good name.
    const nm = String(name ?? "").trim();
    const cleanName = nm && nm.toLowerCase() !== "customer" ? nm : undefined;
    await recordOutbound({ to: phone, text, wamid, name: cleanName });
  } catch {
    /* inbox mirror is best-effort; never surface here */
  }
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
  const res = await sendTemplate({
    to: o.phone,
    templateName: T.orderConfirmation.name,
    languageCode: T.orderConfirmation.lang,
    // The template's IMAGE header: use this order's product photo when we have
    // it, else the Viora logo. (A header image is required — never send empty.)
    headerImageUrl: o.productImage || T.orderConfirmation.headerImageUrl,
    bodyParams: [o.name, o.orderId, o.amount, o.paymentMode],
  });
  await logOutbound(o.phone, render.orderConfirmation(o), res, o.name);
  return res;
}

// --- Workflow 2: out for delivery --------------------------------------------
// body {{1}} name, {{2}} order id, {{3}} product, {{4}} amount ; button url {{1}} tracking suffix.
async function sendOutForDelivery(o) {
  const res = await sendTemplate({
    to: o.phone,
    templateName: T.outForDelivery.name,
    languageCode: T.outForDelivery.lang,
    bodyParams: [o.name, o.orderId, o.product, o.amount],
    // The AWB is the suffix that fills the template button's tracking URL {{1}}.
    urlButtons: [{ index: "0", param: o.awb }],
  });
  await logOutbound(o.phone, render.outForDelivery(o), res, o.name);
  return res;
}

// --- Workflow 3: delivered ----------------------------------------------------
// body {{1}} name, {{2}} order id.
async function sendDelivered(o) {
  const res = await sendTemplate({
    to: o.phone,
    templateName: T.delivered.name,
    languageCode: T.delivered.lang,
    bodyParams: [o.name, o.orderId],
  });
  await logOutbound(o.phone, render.delivered(o), res, o.name);
  return res;
}

// --- Workflow 4: review request (2-3 days post-delivery) ---------------------
// body {{1}} name, {{2}} order id ; button url {{1}} product slug.
async function sendReviewRequest(o) {
  const res = await sendTemplate({
    to: o.phone,
    templateName: T.reviewRequest.name,
    languageCode: T.reviewRequest.lang,
    bodyParams: [o.name, o.orderId],
    // TODO: pass the real Wix product slug through the store instead of slugifying the name.
    urlButtons: [{ index: "0", param: slugify(o.product) }],
  });
  await logOutbound(o.phone, render.reviewRequest(o), res, o.name);
  return res;
}

// --- Workflow 5: abandoned cart ----------------------------------------------
// body {{1}} name, {{2}} product, {{3}} value ; button url {{1}} cart recovery token.
async function sendAbandonedCart(o) {
  const res = await sendTemplate({
    to: o.phone,
    templateName: T.abandonedCart.name,
    languageCode: T.abandonedCart.lang,
    bodyParams: [o.name, o.product, o.amount],
    urlButtons: [{ index: "0", param: o.cartToken }],
  });
  await logOutbound(o.phone, render.abandonedCart(o), res, o.name);
  return res;
}

// --- Order cancelled (fired when the order is cancelled in Wix or Velocity) ---
// body {{1}} name, {{2}} order id, {{3}} product, {{4}} amount, {{5}} payment mode.
// One template covers both reasons (customer request / couldn't connect on call);
// the approved body text mentions both, so no reason variable is needed.
async function sendOrderCancelled(o) {
  const res = await sendTemplate({
    to: o.phone,
    templateName: T.orderCancelled.name,
    languageCode: T.orderCancelled.lang,
    // Same as confirmation: this order's product photo when we have it, else the logo.
    headerImageUrl: o.productImage || T.orderCancelled.headerImageUrl,
    bodyParams: [
      o.name,
      o.orderId,
      o.product,
      o.amount,
      prettyPayment(o.paymentMode),
    ],
  });
  await logOutbound(o.phone, render.orderCancelled(o), res, o.name);
  return res;
}

export {
  fromRow,
  slugify,
  prettyPayment,
  sendOrderConfirmation,
  sendOutForDelivery,
  sendDelivered,
  sendReviewRequest,
  sendAbandonedCart,
  sendOrderCancelled,
};
