// Central registry of the 5 approved WhatsApp templates and how their variables
// map to our order data. Keeping this in ONE place means that when Meta forces a
// template rename (e.g. a "_v2"), or the approved language differs, we change it
// here — not scattered across five routes.
//
// IMPORTANT about `lang`: the language code must EXACTLY match the language of
// the approved template in WhatsApp Manager (e.g. "en_US", "en", "en_GB").
// A mismatch is the #1 cause of error 132001 "template does not exist".
//
// About buttons:
//  - order_confirmation_v1 has two QUICK-REPLY buttons (Confirm / Cancel). Quick
//    replies are static — they carry NO parameters when sending. We only read
//    the customer's tap back on the inbound /webhook. So no button config here.
//  - the others have ONE dynamic URL button. WhatsApp stores the base URL in the
//    template with a trailing {{1}}; we send only the SUFFIX that fills {{1}}.
//    e.g. template url "https://track.velocity/{{1}}" + suffix "AWB123".

// Every approved Viora template is in language "en" (verified against the WABA
// via /api/templates). A wrong code is the #1 cause of 132001 "template does not
// exist", so default to "en" (overridable per-deploy with TPL_LANG).
const LANG = process.env.TPL_LANG || "en";

// order_confirmation_v1 was approved with an IMAGE header, so every send must
// include a media header pointing at a public HTTPS image. Overridable via env;
// defaults to the Viora Jewels logo already served for the order emails.
const HEADER_IMAGE_URL =
  process.env.WHATSAPP_HEADER_IMAGE_URL || "https://viorajewel.in/email-logo.png";

export default {
  orderConfirmation: {
    name: process.env.TPL_ORDER_CONFIRMATION || "order_confirmation_v1",
    lang: LANG,
    headerImageUrl: HEADER_IMAGE_URL, // template has an IMAGE header
    // body {{1}} name, {{2}} order id, {{3}} amount, {{4}} payment mode
  },
  // Order dispatched / picked up — the tracking link is the BODY variable {{3}}
  // (this template has NO url button); IMAGE header like the others.
  dispatched: {
    name: process.env.TPL_ORDER_DISPATCHED || "order_dispatched_v1",
    lang: LANG,
    headerImageUrl: HEADER_IMAGE_URL, // template has an IMAGE header
    // body {{1}} name, {{2}} order id, {{3}} tracking URL
  },
  outForDelivery: {
    name: process.env.TPL_OUT_FOR_DELIVERY || "out_for_delivery_v1",
    lang: LANG,
    headerImageUrl: HEADER_IMAGE_URL, // template has an IMAGE header
    // body {{1}} name, {{2}} order id, {{3}} product, {{4}} amount ; NO button
  },
  delivered: {
    name: process.env.TPL_ORDER_DELIVERED || "order_delivered_v1",
    lang: LANG,
    headerImageUrl: HEADER_IMAGE_URL, // template has an IMAGE header
    // body {{1}} name, {{2}} order id
  },
  reviewRequest: {
    // review_request_util_v1 is UTILITY (not MARKETING) so it isn't hit by Meta's
    // per-user marketing frequency cap (error 131049) that was silently dropping
    // the old review_request_v1 for some customers. See send fn: it is HEADER-LESS.
    name: process.env.TPL_REVIEW_REQUEST || "review_request_util_v1",
    lang: LANG,
    headerImageUrl: null, // UTILITY review template has NO header — send none
    // body {{1}} name, {{2}} order id ; button url {{1}} product slug
  },
  abandonedCart: {
    name: process.env.TPL_ABANDONED_CART || "abandoned_cart_v1",
    lang: LANG,
    headerImageUrl: HEADER_IMAGE_URL, // template has an IMAGE header
    // body {{1}} name, {{2}} product, {{3}} value ; button url {{1}} cart token
  },
  orderCancelled: {
    name: process.env.TPL_ORDER_CANCELLED || "order_cancelled_v1",
    lang: LANG,
    headerImageUrl: HEADER_IMAGE_URL, // template has an IMAGE header (product photo / logo)
    // body {{1}} name, {{2}} order id, {{3}} product, {{4}} amount, {{5}} payment mode
  },
};
