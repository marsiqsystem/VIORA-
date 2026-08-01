// Workflow dispatch layer: turns an order into the correct WhatsApp template
// call for each of the 5 workflows. This is the ONLY place that knows how our
// order fields line up with each template's {{1}}, {{2}}… variables and button
// suffixes — so if a template's variable order changes, it changes here alone.
//
// Every function returns the sender's result object
// ({ ok, dryRun, ... }) and never throws — callers decide what to do with it
// (record idempotency only on a real send, log on failure, etc.).

import { sendTemplate } from "./whatsapp";
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
function sendOrderConfirmation(o) {
  return sendTemplate({
    to: o.phone,
    templateName: T.orderConfirmation.name,
    languageCode: T.orderConfirmation.lang,
    // The template's IMAGE header: use this order's product photo when we have
    // it, else the Viora logo. (A header image is required — never send empty.)
    headerImageUrl: o.productImage || T.orderConfirmation.headerImageUrl,
    bodyParams: [o.name, o.orderId, o.amount, o.paymentMode],
  });
}

// --- Workflow 2: out for delivery --------------------------------------------
// body {{1}} name, {{2}} order id, {{3}} product, {{4}} amount ; button url {{1}} tracking suffix.
function sendOutForDelivery(o) {
  return sendTemplate({
    to: o.phone,
    templateName: T.outForDelivery.name,
    languageCode: T.outForDelivery.lang,
    bodyParams: [o.name, o.orderId, o.product, o.amount],
    // The AWB is the suffix that fills the template button's tracking URL {{1}}.
    urlButtons: [{ index: "0", param: o.awb }],
  });
}

// --- Workflow 3: delivered ----------------------------------------------------
// body {{1}} name, {{2}} order id.
function sendDelivered(o) {
  return sendTemplate({
    to: o.phone,
    templateName: T.delivered.name,
    languageCode: T.delivered.lang,
    bodyParams: [o.name, o.orderId],
  });
}

// --- Workflow 4: review request (2-3 days post-delivery) ---------------------
// body {{1}} name, {{2}} order id ; button url {{1}} product slug.
function sendReviewRequest(o) {
  return sendTemplate({
    to: o.phone,
    templateName: T.reviewRequest.name,
    languageCode: T.reviewRequest.lang,
    bodyParams: [o.name, o.orderId],
    // TODO: pass the real Wix product slug through the store instead of slugifying the name.
    urlButtons: [{ index: "0", param: slugify(o.product) }],
  });
}

// --- Workflow 5: abandoned cart ----------------------------------------------
// body {{1}} name, {{2}} product, {{3}} value ; button url {{1}} cart recovery token.
function sendAbandonedCart(o) {
  return sendTemplate({
    to: o.phone,
    templateName: T.abandonedCart.name,
    languageCode: T.abandonedCart.lang,
    bodyParams: [o.name, o.product, o.amount],
    urlButtons: [{ index: "0", param: o.cartToken }],
  });
}

// --- Order cancelled (fired when the order is cancelled in Wix or Velocity) ---
// body {{1}} name, {{2}} order id, {{3}} product, {{4}} amount, {{5}} payment mode.
// One template covers both reasons (customer request / couldn't connect on call);
// the approved body text mentions both, so no reason variable is needed.
function sendOrderCancelled(o) {
  return sendTemplate({
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
