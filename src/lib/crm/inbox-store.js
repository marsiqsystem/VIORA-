// Two-way WhatsApp INBOX storage seam.
//
// The single module that persists WhatsApp conversations so an operator can
// READ customer replies and REPLY to them from an in-site dashboard (/inbox).
// Everything the inbox needs goes through the ~6 functions below, so the
// underlying store can be swapped without touching the API routes or the UI.
//
// STORE: the same Upstash Redis REST API already used by idempotency.js — one
// command POSTed as a JSON array, response `{ result }`. NO SDK dependency.
// Env (either name works): KV_REST_API_URL / UPSTASH_REDIS_REST_URL and
// KV_REST_API_TOKEN / UPSTASH_REDIS_REST_TOKEN.
//
// SENDING IS NOT TOUCHED. This module only records what was sent/received and
// reads it back. Delivery still happens in whatsapp.js exactly as before.
//
// NON-THROWING: every export catches its own errors and degrades gracefully
// (returns [] / null / {ok:false}). A store outage must never crash the webhook
// that also delivers real order messages.
//
// KEY LAYOUT (all under the `wa:` prefix):
//   wa:index                ZSET  member=phone            score=lastActivityMs   (conversation ordering, newest first)
//   wa:conv:<phone>         STR   JSON conversation meta  {phone,name,lastText,lastTs,unread,lastInboundTs,lastOutboundTs}
//   wa:msgs:<phone>         LIST  JSON message            {id,dir:'in'|'out',text,ts,type}   (capped, oldest→newest)
//   wa:st:<phone>           HASH  field=wamid             value='sent'|'delivered'|'read'|'failed'   (outbound delivery ticks)

const PREFIX = "wa:";
const INDEX_KEY = `${PREFIX}index`;
const MSG_CAP = 300; // keep at most this many messages per conversation
const WINDOW_MS = 24 * 60 * 60 * 1000; // WhatsApp free-form service window

function kvCfg() {
  return {
    url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "")
      .trim()
      .replace(/\/$/, ""),
    token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim(),
  };
}

/** True when a Redis KV is actually configured for this deployment. */
function isConfigured() {
  const { url, token } = kvCfg();
  return !!url && !!token;
}

/** POST one Redis command as a JSON array; returns the parsed `result` (or throws). */
async function command(args) {
  const { url, token } = kvCfg();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`kv command failed HTTP ${res.status}`);
    err.data = data;
    throw err;
  }
  return data?.result;
}

// --- helpers -----------------------------------------------------------------

/** Digits-only international phone (Meta gives no "+"). Empty string if none. */
function normPhone(p) {
  return String(p || "").replace(/[^\d]/g, "");
}

function convKey(phone) {
  return `${PREFIX}conv:${phone}`;
}
function msgsKey(phone) {
  return `${PREFIX}msgs:${phone}`;
}
function statusKey(phone) {
  return `${PREFIX}st:${phone}`;
}

function safeParse(str, fallback) {
  if (str == null) return fallback;
  if (typeof str === "object") return str; // some REST results are pre-parsed
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/** Read a conversation meta blob (or a fresh default). Never throws. */
async function readConv(phone) {
  const base = {
    phone,
    name: "",
    lastText: "",
    lastTs: 0,
    unread: 0,
    lastInboundTs: 0,
    lastOutboundTs: 0,
  };
  try {
    const raw = await command(["GET", convKey(phone)]);
    return { ...base, ...safeParse(raw, {}) };
  } catch {
    return base;
  }
}

/** Persist a conversation meta blob and bump its position in the index. */
async function writeConv(conv) {
  await command(["SET", convKey(conv.phone), JSON.stringify(conv)]);
  await command(["ZADD", INDEX_KEY, conv.lastTs || Date.now(), conv.phone]);
}

/** Append a message to a conversation's list and cap the list length. */
async function pushMessage(phone, message) {
  await command(["RPUSH", msgsKey(phone), JSON.stringify(message)]);
  // Keep only the most recent MSG_CAP messages (negative indexes = from the end).
  await command(["LTRIM", msgsKey(phone), -MSG_CAP, -1]);
}

// --- inbound dedupe (Meta webhooks are at-least-once) ------------------------
// If our 200 ACK is slow (a cold start), Meta REDELIVERS the same event, which
// would RPUSH the customer's message twice. Claim the provider message id once
// (SET NX) before storing so a redelivery is skipped. TTL because status updates
// always arrive within minutes — 3 days is very safe and keeps KV from growing.
const SEEN_TTL_S = 60 * 60 * 24 * 3;
async function claimInbound(wamid) {
  if (!wamid) return true; // no id to dedupe on — let it through
  try {
    const r = await command(["SET", `${PREFIX}seen:${wamid}`, "1", "NX", "EX", String(SEEN_TTL_S)]);
    return r === "OK"; // "OK" = first time (store it); null = duplicate (skip)
  } catch {
    return true; // fail-open: a store hiccup must never drop a real message
  }
}

// --- delivery-status ranking (never downgrade; failed is terminal) -----------
// Out-of-order webhooks (Meta doesn't guarantee ordering) could otherwise flip a
// "read" bubble back to "delivered". Rank the states and only ever move forward.
const STATUS_RANK = { pending: 0, sent: 1, delivered: 2, read: 3 };
async function applyStatus(phone, wamid, status) {
  if (!wamid || !status) return;
  try {
    const cur = await command(["HGET", statusKey(phone), wamid]);
    if (cur === "failed") return; // failed sticks — never overwrite it
    if (status === "failed") {
      // Only mark failed if it hasn't already been delivered/read (can't un-deliver).
      if ((STATUS_RANK[cur] ?? -1) >= STATUS_RANK.delivered) return;
      await command(["HSET", statusKey(phone), wamid, "failed"]);
      return;
    }
    const curRank = STATUS_RANK[cur] ?? -1;
    const newRank = STATUS_RANK[status] ?? -1;
    if (newRank > curRank) await command(["HSET", statusKey(phone), wamid, status]);
  } catch {
    /* best-effort tick update */
  }
}

// --- INGEST (inbound customer messages + delivery statuses) ------------------

/**
 * Extract text from any supported inbound message type (mirrors whatsappInbound).
 */
function inboundText(msg) {
  switch (msg?.type) {
    case "text":
      return msg.text?.body || "";
    case "button":
      return msg.button?.text || "";
    case "interactive":
      return (
        msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || ""
      );
    case "image":
      return msg.image?.caption ? `📷 ${msg.image.caption}` : "📷 Photo";
    case "video":
      return "🎥 Video";
    case "audio":
      return "🎵 Audio";
    case "document":
      return `📄 ${msg.document?.filename || "Document"}`;
    case "sticker":
      return "🌟 Sticker";
    case "location":
      return "📍 Location";
    case "reaction":
      // Customer tapped an emoji reaction on one of our messages. Meta sends the
      // chosen emoji in msg.reaction.emoji (empty string when the reaction is
      // removed). Show the emoji itself instead of a bare "[reaction]" label.
      return msg.reaction?.emoji ? `Reacted ${msg.reaction.emoji}` : "↩️ Removed reaction";
    default:
      return msg?.type ? `[${msg.type}]` : "";
  }
}

/**
 * Pull the media handle off any media-bearing inbound message, so the inbox can
 * render the photo inline (image/sticker) or offer a download (video/doc/audio)
 * via the auth'd media proxy. Returns null for plain text/button messages.
 */
function inboundMedia(msg) {
  const m = msg?.[msg?.type];
  if (!m || !m.id) return null;
  return {
    mediaId: m.id,
    mime: m.mime_type || "",
    filename: m.filename || "",
  };
}

/**
 * Pull latitude/longitude (+ optional name/address) off an inbound location
 * message so the inbox can render a tappable Google-Maps card. Returns null for
 * any non-location message.
 */
function inboundLocation(msg) {
  if (msg?.type !== "location" || !msg.location) return null;
  const { latitude, longitude, name, address } = msg.location;
  if (latitude == null || longitude == null) return null;
  return {
    lat: Number(latitude),
    long: Number(longitude),
    name: name || "",
    address: address || "",
  };
}

/**
 * Ingest a raw Meta webhook body into the inbox store: saves every inbound
 * customer message and applies every outbound delivery/read status.
 *
 * Purely additive to the existing autoReply pipeline — call it alongside
 * handleInbound. Never throws; returns a small summary for logging.
 *
 * @returns {Promise<{inbound:number, statuses:number, stored:boolean}>}
 */
async function ingestWebhook(body) {
  if (!isConfigured()) return { inbound: 0, statuses: 0, stored: false };

  let inbound = 0;
  let statuses = 0;

  try {
    for (const entry of body?.entry || []) {
      for (const change of entry?.changes || []) {
        const value = change?.value || {};

        // wa_id -> profile name
        const nameByWaId = {};
        for (const c of value.contacts || []) {
          if (c?.wa_id) nameByWaId[c.wa_id] = c?.profile?.name || "";
        }

        // 1) inbound customer messages
        for (const msg of value.messages || []) {
          const phone = normPhone(msg.from);
          if (!phone) continue;
          // Skip a Meta redelivery of a message we've already stored.
          if (!(await claimInbound(msg.id))) continue;
          const tsMs = msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now();
          const text = inboundText(msg);
          const media = inboundMedia(msg);
          const location = inboundLocation(msg);
          // When the customer swipe-replies to one of our messages, Meta echoes
          // the quoted message's id in msg.context.id — store it so the inbox can
          // render "in reply to …" by looking that id up in the thread.
          const quotedId = msg.context?.id || "";

          await pushMessage(phone, {
            id: msg.id || `in_${tsMs}`,
            dir: "in",
            text,
            ts: tsMs,
            type: msg.type || "text",
            ...(media
              ? { mediaId: media.mediaId, mime: media.mime, filename: media.filename }
              : {}),
            ...(location ? { location } : {}),
            ...(quotedId ? { quotedId } : {}),
          });

          const conv = await readConv(phone);
          // Keep an already-known name (the authoritative order/consignee name set
          // by recordOutbound) — only fall back to the WhatsApp profile name when
          // we don't yet have one, so a real reply never downgrades the title.
          conv.name = conv.name || nameByWaId[phone] || "";
          conv.lastText = text;
          conv.lastTs = tsMs;
          conv.lastInboundTs = tsMs;
          conv.unread = (Number(conv.unread) || 0) + 1;
          await writeConv(conv);
          inbound++;
        }

        // 2) delivery/read statuses for messages WE sent (keyed by wamid).
        // Ranked so an out-of-order webhook never downgrades a tick.
        for (const st of value.statuses || []) {
          const phone = normPhone(st.recipient_id);
          const wamid = st.id;
          const status = st.status; // sent | delivered | read | failed
          if (!phone || !wamid || !status) continue;
          await applyStatus(phone, wamid, status);
          statuses++;
        }
      }
    }
    return { inbound, statuses, stored: true };
  } catch (e) {
    console.warn("[inbox] ingestWebhook error (ignored):", e?.message || e);
    return { inbound, statuses, stored: false };
  }
}

// --- RECORD OUTBOUND (a reply we send: manual, auto-reply, etc.) -------------

/**
 * Record a message we sent so it appears in the inbox thread. Call after a
 * successful (or dry-run) send. Never throws.
 *
 * @param {object} p
 * @param {string} p.to     recipient phone (any format; normalized here)
 * @param {string} p.text   the message body shown in the thread
 * @param {string} [p.wamid] the Meta message id (enables delivery ticks)
 * @param {number} [p.ts]   epoch ms (defaults now)
 * @param {string} [p.status] initial status (default 'sent'; 'pending' for dry-run)
 * @param {string} [p.name]  the customer's REAL name from the order (e.g. the
 *                           Velocity/Wix consignee name). When given it becomes
 *                           the conversation title — authoritative over the
 *                           WhatsApp profile name — so an operator sees
 *                           "Zeeshan Shamim", not a bare number.
 * @param {string} [p.type]  message kind: 'text' (default), 'image' or 'document'.
 * @param {string} [p.mediaId] Meta media id (uploaded photo/doc) — renders via the media proxy.
 * @param {string} [p.imageUrl] public image URL (e.g. a template's header image) — rendered directly.
 * @param {string} [p.filename] document file name (for a 'document' message).
 * @param {boolean} [p.template] true if this was an approved-template send (shows a TEMPLATE tag).
 * @param {{id:string,text:string,dir:string}} [p.quoted] snapshot of the message this reply quotes.
 */
async function recordOutbound({ to, text, wamid, ts, status = "sent", name, type = "text", mediaId, imageUrl, filename, template, quoted } = {}) {
  if (!isConfigured()) return { ok: false };
  const phone = normPhone(to);
  if (!phone) return { ok: false };
  const tsMs = ts || Date.now();
  const id = wamid || `out_${tsMs}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await pushMessage(phone, {
      id,
      dir: "out",
      text: String(text ?? ""),
      ts: tsMs,
      type,
      ...(mediaId ? { mediaId } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(filename ? { filename } : {}),
      ...(template ? { template: true } : {}),
      // A snapshot { id, text, dir } of the message this reply quotes, so the
      // bubble can show the quoted preview without a lookup.
      ...(quoted && quoted.id ? { quoted } : {}),
    });
    if (wamid) await applyStatus(phone, wamid, status);
    const conv = await readConv(phone);
    // A real order name is authoritative — it labels the chat so the operator can
    // tell at a glance who was messaged (no digging by number / order id).
    const nm = String(name ?? "").trim();
    if (nm) conv.name = nm;
    conv.lastText = String(text ?? "");
    conv.lastTs = tsMs;
    conv.lastOutboundTs = tsMs;
    // Operator answered → nothing new for them to read.
    conv.unread = 0;
    await writeConv(conv);
    return { ok: true, id };
  } catch (e) {
    console.warn("[inbox] recordOutbound error (ignored):", e?.message || e);
    return { ok: false };
  }
}

// --- READ (feeds the UI) -----------------------------------------------------

function withinWindow(conv, now = Date.now()) {
  return !!conv?.lastInboundTs && now - Number(conv.lastInboundTs) < WINDOW_MS;
}

/**
 * List conversations, newest activity first.
 * @returns {Promise<Array<{phone,name,lastText,lastTs,unread,withinWindow}>>}
 */
async function getConversations(limit = 100) {
  if (!isConfigured()) return [];
  try {
    const phones = (await command(["ZREVRANGE", INDEX_KEY, 0, Math.max(0, limit - 1)])) || [];
    if (!phones.length) return [];
    const keys = phones.map(convKey);
    const blobs = (await command(["MGET", ...keys])) || [];
    const now = Date.now();
    return phones.map((phone, i) => {
      const conv = { phone, name: "", lastText: "", lastTs: 0, unread: 0, ...safeParse(blobs[i], {}) };
      return {
        phone,
        name: conv.name || "",
        lastText: conv.lastText || "",
        lastTs: Number(conv.lastTs) || 0,
        unread: Number(conv.unread) || 0,
        withinWindow: withinWindow(conv, now),
      };
    });
  } catch (e) {
    console.warn("[inbox] getConversations error:", e?.message || e);
    return [];
  }
}

/** Flatten Upstash's HGETALL array [f1,v1,f2,v2,...] into an object. */
function hashToObj(arr) {
  const out = {};
  if (Array.isArray(arr)) {
    for (let i = 0; i + 1 < arr.length; i += 2) out[arr[i]] = arr[i + 1];
  } else if (arr && typeof arr === "object") {
    Object.assign(out, arr);
  }
  return out;
}

/**
 * Full thread for one conversation: meta + ordered messages with ticks.
 * @returns {Promise<{phone,name,withinWindow,messages:Array}>}
 */
async function getMessages(phone) {
  const p = normPhone(phone);
  const empty = { phone: p, name: "", withinWindow: false, messages: [] };
  if (!isConfigured() || !p) return empty;
  try {
    const [rawList, rawStatus, conv] = await Promise.all([
      command(["LRANGE", msgsKey(p), 0, -1]).catch(() => []),
      command(["HGETALL", statusKey(p)]).catch(() => ({})),
      readConv(p),
    ]);
    const statuses = hashToObj(rawStatus);
    const messages = (rawList || [])
      .map((m) => safeParse(m, null))
      .filter(Boolean)
      .map((m) => (m.dir === "out" && statuses[m.id] ? { ...m, status: statuses[m.id] } : m));
    return {
      phone: p,
      name: conv.name || "",
      withinWindow: withinWindow(conv),
      lastInboundTs: Number(conv.lastInboundTs) || 0,
      messages,
    };
  } catch (e) {
    console.warn("[inbox] getMessages error:", e?.message || e);
    return empty;
  }
}

/**
 * Delete ONE message from a conversation (WhatsApp "delete for me"). Rewrites the
 * capped list without that message id and refreshes the conversation preview.
 * This only removes it from OUR inbox — it cannot unsend it on the customer's
 * WhatsApp. Never throws.
 */
async function deleteMessage(phone, id) {
  if (!isConfigured()) return { ok: false };
  const p = normPhone(phone);
  if (!p || !id) return { ok: false };
  try {
    const raw = await command(["LRANGE", msgsKey(p), 0, -1]).catch(() => []);
    const msgs = (raw || []).map((m) => safeParse(m, null)).filter(Boolean);
    const kept = msgs.filter((m) => m.id !== id);
    if (kept.length === msgs.length) return { ok: true }; // nothing matched
    await command(["DEL", msgsKey(p)]);
    if (kept.length) await command(["RPUSH", msgsKey(p), ...kept.map((m) => JSON.stringify(m))]);
    const conv = await readConv(p);
    const last = kept[kept.length - 1];
    conv.lastText = last ? String(last.text || "") : "";
    if (last) conv.lastTs = Number(last.ts) || conv.lastTs;
    await command(["SET", convKey(p), JSON.stringify(conv)]);
    return { ok: true };
  } catch (e) {
    console.warn("[inbox] deleteMessage error:", e?.message || e);
    return { ok: false };
  }
}

/**
 * Delete an ENTIRE conversation (WhatsApp "delete chat") — removes its meta,
 * messages, delivery ticks and its place in the index. Only clears OUR inbox,
 * not the customer's WhatsApp. Never throws.
 */
async function deleteConversation(phone) {
  if (!isConfigured()) return { ok: false };
  const p = normPhone(phone);
  if (!p) return { ok: false };
  try {
    await command(["DEL", convKey(p)]);
    await command(["DEL", msgsKey(p)]);
    await command(["DEL", statusKey(p)]);
    await command(["ZREM", INDEX_KEY, p]);
    return { ok: true };
  } catch (e) {
    console.warn("[inbox] deleteConversation error:", e?.message || e);
    return { ok: false };
  }
}

/** Clear the unread badge for a conversation (operator opened it). */
async function markRead(phone) {
  if (!isConfigured()) return { ok: false };
  const p = normPhone(phone);
  if (!p) return { ok: false };
  try {
    const conv = await readConv(p);
    if (conv.unread) {
      conv.unread = 0;
      await command(["SET", convKey(p), JSON.stringify(conv)]);
    }
    return { ok: true };
  } catch (e) {
    console.warn("[inbox] markRead error:", e?.message || e);
    return { ok: false };
  }
}

// --- AUTH (protect the inbox: it reads customer PII + sends as the brand) -----

/**
 * True when the provided passcode matches INBOX_SECRET. Returns false when the
 * secret is unset — the inbox APIs must FAIL CLOSED (opposite of idempotency's
 * fail-open) because they expose private chats and can message customers.
 */
function authOk(provided) {
  const secret = String(process.env.INBOX_SECRET || "").trim();
  if (!secret) return false;
  return String(provided || "").trim() === secret;
}

/** True when a passcode is even configured (used to return a helpful 503). */
function authConfigured() {
  return !!String(process.env.INBOX_SECRET || "").trim();
}

/** Pull the passcode from a request: `x-inbox-key` header or `?key=`. */
function keyFromRequest(req) {
  try {
    const h = req.headers.get("x-inbox-key");
    if (h) return h;
    const url = new URL(req.url);
    return url.searchParams.get("key") || "";
  } catch {
    return "";
  }
}

export {
  isConfigured,
  ingestWebhook,
  recordOutbound,
  getConversations,
  getMessages,
  markRead,
  deleteMessage,
  deleteConversation,
  authOk,
  authConfigured,
  keyFromRequest,
  normPhone,
  withinWindow,
  WINDOW_MS,
};
