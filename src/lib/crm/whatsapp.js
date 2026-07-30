// Reusable Meta WhatsApp Cloud API sender.
//
// This is the single place that talks to graph.facebook.com. Routes and scripts
// call these helpers instead of building fetch requests themselves, so auth,
// the API version, and error handling live in exactly one file.
//
// Every send respects a DRY-RUN mode: when WHATSAPP_SEND_ENABLED is not "true"
// (or `{ dryRun: true }` is passed), the helper builds and logs the exact
// payload it WOULD post, but does not call Meta. That lets the whole Wix ->
// WhatsApp pipeline be wired and tested end-to-end before going live.

const GRAPH = "https://graph.facebook.com";

function config() {
  return {
    token: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.PHONE_NUMBER_ID,
    version: process.env.GRAPH_API_VERSION || "v22.0",
    // Live only when explicitly enabled — safe default is dry run.
    // `.trim()` so a trailing space/newline pasted into the Vercel dashboard
    // (e.g. "true ") can never silently keep us in dry-run.
    sendEnabled: String(process.env.WHATSAPP_SEND_ENABLED).trim().toLowerCase() === "true",
  };
}

/**
 * Low-level send. Posts an already-built message `payload` to the Cloud API,
 * unless in dry-run mode.
 *
 * @returns {Promise<{ok:boolean, dryRun:boolean, status?:number, data?:any, error?:any}>}
 *          Never throws — callers (webhooks) must not crash on a send failure.
 */
async function sendRaw(payload, { dryRun } = {}) {
  const { token, phoneNumberId, version, sendEnabled } = config();

  if (!token || !phoneNumberId) {
    const error = "WHATSAPP_ACCESS_TOKEN / PHONE_NUMBER_ID not configured.";
    console.error(`[whatsapp] ${error}`);
    return { ok: false, dryRun: false, error };
  }

  const isDry = dryRun ?? !sendEnabled;
  if (isDry) {
    console.log(
      "[whatsapp] DRY RUN — would POST this message (set WHATSAPP_SEND_ENABLED=true to send):"
    );
    console.log(JSON.stringify(payload, null, 2));
    return { ok: true, dryRun: true, data: { simulated: true } };
  }

  const url = `${GRAPH}/${version}/${phoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[whatsapp] send failed (HTTP ${res.status}):`, JSON.stringify(data));
      return { ok: false, dryRun: false, status: res.status, data, error: data?.error };
    }
    console.log(`[whatsapp] sent, id=${data?.messages?.[0]?.id}`);
    return { ok: true, dryRun: false, status: res.status, data };
  } catch (error) {
    console.error("[whatsapp] network error:", error);
    return { ok: false, dryRun: false, error };
  }
}

/**
 * Send a free-form text message. Only allowed inside the 24-hour customer
 * service window (i.e. the customer messaged you recently). For a fresh order
 * confirmation to a cold number, use sendTemplate() instead.
 */
function sendText({ to, body }, opts) {
  return sendRaw(
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    },
    opts
  );
}

/**
 * Send an approved template message. This is what an order confirmation to a
 * new customer must use (templates bypass the 24-hour window).
 *
 * Supports the component kinds our 5 templates use:
 *  - body variables  ({{1}}, {{2}}…)               -> bodyParams
 *  - a MEDIA (image) header                         -> headerImageUrl
 *  - a header text variable ({{1}} in the header)  -> headerParams
 *  - dynamic URL button suffixes                   -> urlButtons
 *
 * A template's header is EITHER media OR text, never both — so if
 * `headerImageUrl` is given it wins and `headerParams` is ignored. A template
 * approved with an IMAGE header (e.g. order_confirmation_v1) REQUIRES the image
 * header component on every send; omitting it gives Meta's
 * "header: Format mismatch, expected IMAGE, received UNKNOWN".
 *
 * Static QUICK-REPLY buttons (e.g. order_confirmation's Confirm/Cancel) need
 * NOTHING here — they carry no parameters on send; you read the tap back on the
 * inbound /webhook.
 *
 * @param {object}   p
 * @param {string}   p.to            recipient, digits-only international format
 * @param {string}   p.templateName  approved template name
 * @param {string}   [p.languageCode="en_US"]  must match the approved template's language
 * @param {(string|number)[]} [p.bodyParams=[]]   ordered body {{1}},{{2}}… values
 * @param {string}   [p.headerImageUrl]  public HTTPS image URL for a media header
 * @param {(string|number)[]} [p.headerParams=[]] ordered header TEXT variable values (usually 0 or 1)
 * @param {{index:string|number, param:string}[]} [p.urlButtons=[]]
 *        one entry per dynamic URL button: `index` is the button's position in
 *        the template (0-based, as a string), `param` is the SUFFIX that fills
 *        that button's {{1}} (e.g. the AWB, product slug, or cart token).
 */
function sendTemplate(
  {
    to,
    templateName,
    languageCode = "en_US",
    bodyParams = [],
    headerImageUrl,
    headerParams = [],
    urlButtons = [],
  },
  opts
) {
  const components = [];

  if (headerImageUrl) {
    // Media header: the parameter type must match the template's approved
    // header format (image), with the asset supplied as a public link.
    components.push({
      type: "header",
      parameters: [{ type: "image", image: { link: headerImageUrl } }],
    });
  } else if (headerParams.length > 0) {
    components.push({
      type: "header",
      // `?? ""` so a missing value never reaches the customer as the literal
      // string "undefined"/"null".
      parameters: headerParams.map((text) => ({ type: "text", text: String(text ?? "") })),
    });
  }

  if (bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParams.map((text) => ({ type: "text", text: String(text ?? "") })),
    });
  }

  for (const btn of urlButtons) {
    if (btn == null || btn.param == null || btn.param === "") continue;
    components.push({
      type: "button",
      sub_type: "url",
      index: String(btn.index),
      parameters: [{ type: "text", text: String(btn.param) }],
    });
  }

  return sendRaw(
    {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 ? { components } : {}),
      },
    },
    opts
  );
}

export { sendRaw, sendText, sendTemplate, config };
