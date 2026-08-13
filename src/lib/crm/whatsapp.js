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

// WhatsApp rejects an image-header/media link whose file is larger than 5 MB
// with error 131053 ("Image file has size … must be atmost 5242880 bytes"),
// which silently drops the whole template send. Wix product photos are served
// at up to 2048×2048 q90 PNG (~9 MB), well over that limit — so before handing
// any Wix image to Meta, rewrite its transform to a small, safe size. A jewelry
// photo at 800×800 q80 is ~1.5 MB, comfortably under 5 MB (the 2048 original is
// ~9 MB), and looks identical inside WhatsApp's header. Non-Wix links (our own
// logo asset) are already small and pass through untouched.
function capImageForWhatsApp(url) {
  const u = String(url ?? "").trim();
  if (!u) return u;
  // Wix static media URLs look like:
  //   https://static.wixstatic.com/media/<id>~mv2.png/v1/<transform>/file.png
  // Replace whatever `<transform>` is (fit/fill, any w/h/q) with a capped one.
  // The `<transform>` is itself several slash-separated parts
  // (e.g. `fit/w_2048,h_2048,q_90`), so match non-greedily up to `/file`.
  return u.replace(
    /(static\.wixstatic\.com\/media\/[^/]+)\/v1\/.+?\/file/i,
    "$1/v1/fit/w_800,h_800,q_80/file"
  );
}

function config() {
  return {
    token: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.PHONE_NUMBER_ID,
    // WhatsApp Business Account (WABA) id — needed to LIST approved templates for
    // the broadcast composer. Either env name works.
    businessId: (process.env.WHATSAPP_BUSINESS_ID || process.env.WABA_ID || "").trim(),
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
function sendText({ to, body, replyTo }, opts) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body },
  };
  // Quote/reply: WhatsApp threads this message under the one being replied to.
  // `replyTo` must be a real inbound/outbound wamid ("wamid.…").
  if (replyTo) payload.context = { message_id: replyTo };
  return sendRaw(payload, opts);
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
 * @param {object} [opts]
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
    // header format (image), with the asset supplied as a public link. Cap the
    // image size first — a Wix product photo can be ~9 MB, over WhatsApp's 5 MB
    // media limit, which fails the send with error 131053.
    components.push({
      type: "header",
      parameters: [{ type: "image", image: { link: capImageForWhatsApp(headerImageUrl) } }],
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

/**
 * Send an image message by Meta media id (uploaded via uploadMedia) or a public
 * link. Like sendText, only allowed inside the 24-hour service window. Used by
 * the inbox composer's attach button.
 *
 * @param {{to:string, mediaId?:string, link?:string, caption?:string, replyTo?:string}} p
 * @param {object} [opts]
 */
function sendImage({ to, mediaId, link, caption, replyTo }, opts) {
  // A link-based image is subject to WhatsApp's 5 MB media limit (error 131053),
  // so cap a Wix product photo the same way template headers are capped.
  const image = mediaId ? { id: mediaId } : { link: capImageForWhatsApp(link) };
  if (caption) image.caption = caption;
  const payload = { messaging_product: "whatsapp", recipient_type: "individual", to, type: "image", image };
  if (replyTo) payload.context = { message_id: replyTo };
  return sendRaw(payload, opts);
}

/**
 * Send a document message (PDF, etc.) by Meta media id. 24-hour-window only,
 * like sendText/sendImage. Used by the inbox composer's document attachment.
 *
 * @param {{to:string, mediaId:string, filename?:string, caption?:string, replyTo?:string}} p
 * @param {object} [opts]
 */
function sendDocument({ to, mediaId, filename, caption, replyTo }, opts) {
  const document = { id: mediaId };
  if (filename) document.filename = filename;
  if (caption) document.caption = caption;
  const payload = { messaging_product: "whatsapp", recipient_type: "individual", to, type: "document", document };
  if (replyTo) payload.context = { message_id: replyTo };
  return sendRaw(payload, opts);
}

/**
 * Upload a media file to Meta and return its media id (reusable for ~30 days).
 * The inbox uploads the operator's attachment here, then sends it by id so no
 * public hosting is needed. Never throws.
 *
 * @param {{buffer:ArrayBuffer|Uint8Array|Buffer, mime:string, filename?:string}} p
 * @returns {Promise<{ok:boolean, id?:string, dryRun?:boolean, error?:any}>}
 */
async function uploadMedia({ buffer, mime, filename = "upload" }) {
  const { token, phoneNumberId, version, sendEnabled } = config();
  if (!token || !phoneNumberId) return { ok: false, error: "whatsapp not configured" };
  if (!sendEnabled) {
    // Dry-run: don't hit Meta; hand back a fake id so the flow can be exercised.
    return { ok: true, dryRun: true, id: `MOCK-MEDIA-${Date.now()}` };
  }
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mime);
    form.append("file", new Blob([buffer], { type: mime }), filename);
    const res = await fetch(`${GRAPH}/${version}/${phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.id) {
      console.error(`[whatsapp] media upload failed (HTTP ${res.status}):`, JSON.stringify(data));
      return { ok: false, error: data?.error || `HTTP ${res.status}` };
    }
    return { ok: true, id: data.id };
  } catch (error) {
    console.error("[whatsapp] media upload network error:", error);
    return { ok: false, error };
  }
}

/**
 * Resolve a media id to its (short-lived, auth-required) CDN URL, then download
 * the bytes. Used by the inbox media proxy so a customer's photo renders inline
 * without persisting it anywhere. Never throws.
 *
 * @returns {Promise<{ok:boolean, buffer?:Buffer, mime?:string, error?:any}>}
 */
async function fetchMediaBytes(mediaId) {
  const { token, version } = config();
  if (!token) return { ok: false, error: "whatsapp not configured" };
  if (!mediaId) return { ok: false, error: "no media id" };
  try {
    // 1) media id -> temporary URL + mime.
    const metaRes = await fetch(`${GRAPH}/${version}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meta = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok || !meta?.url) {
      return { ok: false, error: meta?.error || `HTTP ${metaRes.status}` };
    }
    // 2) download the bytes (the CDN URL also requires the bearer token).
    const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!binRes.ok) return { ok: false, error: `media download HTTP ${binRes.status}` };
    const buffer = Buffer.from(await binRes.arrayBuffer());
    return { ok: true, buffer, mime: meta.mime_type || "application/octet-stream" };
  } catch (error) {
    console.error("[whatsapp] fetchMediaBytes error:", error);
    return { ok: false, error };
  }
}

/**
 * List the WABA's message templates (for the broadcast composer). Returns the
 * raw template objects (name, status, language, category, components) so the
 * caller can filter to APPROVED and parse variables. Never throws.
 *
 * @returns {Promise<{ok:boolean, templates?:any[], error?:any}>}
 */
async function listTemplates() {
  const { token, businessId, version } = config();
  if (!token || !businessId) {
    return { ok: false, error: "WHATSAPP_ACCESS_TOKEN / WHATSAPP_BUSINESS_ID not configured" };
  }
  try {
    const out = [];
    let url =
      `${GRAPH}/${version}/${businessId}/message_templates` +
      `?fields=name,status,language,category,components&limit=100`;
    // Follow paging so all templates come back, not just the first page.
    for (let page = 0; page < 20 && url; page++) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
      for (const t of data?.data || []) out.push(t);
      url = data?.paging?.next || "";
    }
    return { ok: true, templates: out };
  } catch (error) {
    console.error("[whatsapp] listTemplates error:", error);
    return { ok: false, error };
  }
}

export {
  sendRaw,
  sendText,
  sendTemplate,
  sendImage,
  sendDocument,
  uploadMedia,
  fetchMediaBytes,
  listTemplates,
  config,
};
