"use client";

// Viora WhatsApp INBOX — a WhatsApp-style two-way dashboard.
//
// Left  = conversation list (name, last message, time, unread badge).
// Right = the selected thread (in/out bubbles, delivery/read ticks) + composer.
//
// Data comes from /api/inbox/* (protected by INBOX_SECRET). The operator enters
// the passcode once; it is kept in localStorage and sent as the `x-inbox-key`
// header. The list + open thread are re-polled every 4s (simple + reliable).
//
// MOCK mode: set NEXT_PUBLIC_INBOX_MOCK=1 to preview the UI with seed data
// (no passcode, no API calls) before the webhook/KV are live.

import { useCallback, useEffect, useRef, useState } from "react";

const MOCK = process.env.NEXT_PUBLIC_INBOX_MOCK === "1";
const POLL_MS = 4000;
const KEY_STORE = "viora_inbox_key";
// Every approved Viora template has an IMAGE header; when sending one manually
// from a chat we attach this default header image (the brand logo) so the send
// isn't rejected for a missing media header. Matches the server default.
const DEFAULT_HEADER_IMAGE =
  process.env.NEXT_PUBLIC_WHATSAPP_HEADER_IMAGE || "https://viorajewel.in/email-logo.png";

type Conversation = {
  phone: string;
  name: string;
  lastText: string;
  lastTs: number;
  unread: number;
  withinWindow: boolean;
};
type Message = {
  id: string;
  dir: "in" | "out";
  text: string;
  ts: number;
  type?: string;
  status?: string;
  mediaId?: string;
  mime?: string;
  filename?: string;
  imageUrl?: string;
  template?: boolean;
  error?: { code?: number | null; title?: string; details?: string } | null; // Meta failure reason on a failed send
  location?: { lat: number; long: number; name?: string; address?: string };
  quoted?: { id: string; text: string; dir: "in" | "out" }; // snapshot of a quoted msg (outbound reply)
  quotedId?: string; // id of a quoted msg (inbound reply) — resolved from the thread
};
type Template = {
  name: string;
  language: string;
  category: string;
  bodyText: string;
  bodyVars: number;
  headerFormat: string;
  headerVars: number;
  hasUrlButton: boolean;
  urlButtonIndex: number | null;
};

// A small, dependency-free emoji tray for the composer (CSP blocks CDNs, so no
// external picker library).
const EMOJIS = [
  "😊", "😍", "🥰", "😘", "👍", "🙏", "🎉", "💛", "💍", "✨",
  "🔥", "😂", "😅", "🥳", "😇", "👌", "🙌", "💯", "✅", "🚚",
  "📦", "⭐", "❤️", "😉", "🤗", "💐", "🛍️", "😎",
];
type Thread = {
  phone: string;
  name: string;
  withinWindow: boolean;
  lastInboundTs?: number;
  messages: Message[];
};

// --- colours — Viora brand: ruby / champagne gold / cream --------------------
// Key names kept as `plum`/`plumDark` for minimal churn, but the VALUES are now
// the real storefront palette (globals.css / tailwind.config.ts): ruby #9B1B30,
// deep ruby #5A0A18, champagne gold #C9A66B, cream #F5F1EA, card #FFFDF8.
const C = {
  plum: "#9B1B30", // ruby (primary)
  plumDark: "#5A0A18", // deep ruby
  gold: "#C9A66B", // champagne gold
  goldDark: "#A9844C",
  bgList: "#FFFDF8", // warm card white (chat list)
  bgChat: "#F5F1EA", // cream chat canvas
  cream2: "#EFE4CE", // secondary cream (day dividers, tabs)
  inBubble: "#FFFDF8",
  outBubble: "#F5E8E2", // warm blush outbound bubble
  border: "#D8C8B3", // champagne border
  sub: "#7A716C", // muted text
  text: "#1A1410", // ink
};
// Rich dark ruby gradient for headers (mirrors the site's dark hero gradient).
const HEADER_BG = "linear-gradient(135deg, #1A1410 0%, #5A0A18 100%)";
// Champagne-gold gradient for avatars / accents.
const GOLD_BG = "linear-gradient(135deg, #C9A66B 0%, #A9844C 100%)";
// Serif display face (Cormorant) supplied by the root layout.
const SERIF = "var(--font-cormorant), Georgia, 'Times New Roman', serif";

// --- mock seed data ----------------------------------------------------------
const now = Date.now();
const MOCK_CONVS: Conversation[] = [
  { phone: "918100460566", name: "Zeeshan", lastText: "Order kab tak aayega?", lastTs: now - 120000, unread: 2, withinWindow: true },
  { phone: "919812345678", name: "Aisha", lastText: "Thank you! 🎉", lastTs: now - 3600000, unread: 0, withinWindow: true },
  { phone: "918082136359", name: "Rebel Faisal", lastText: "Confirm Order", lastTs: now - 90000000, unread: 0, withinWindow: false },
];
const MOCK_THREADS: Record<string, Message[]> = {
  "918100460566": [
    { id: "1", dir: "out", text: "Hi Zeeshan! Your Viora order #10207 is confirmed 🎉", ts: now - 300000, status: "read" },
    { id: "2", dir: "in", text: "Order kab tak aayega?", ts: now - 120000 },
    { id: "3", dir: "in", text: "Please jaldi bhej dena", ts: now - 110000 },
  ],
  "919812345678": [
    { id: "1", dir: "out", text: "Your order has been delivered. Enjoy! 💍", ts: now - 4000000, status: "delivered" },
    { id: "2", dir: "in", text: "Thank you! 🎉", ts: now - 3600000 },
  ],
  "918082136359": [
    { id: "1", dir: "in", text: "Confirm Order", ts: now - 90000000 },
  ],
};

// --- small utils -------------------------------------------------------------
function clock(ts: number) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function listTime(ts: number) {
  if (!ts) return "";
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? clock(ts) : d.toLocaleDateString([], { day: "2-digit", month: "short" });
}
// "Today" / "Yesterday" / "12 Aug 2026" divider label for a message's day.
function dayLabel(ts: number) {
  if (!ts) return "";
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}
// Full timestamp shown on hover/tap of a bubble.
function fullStamp(ts: number) {
  if (!ts) return "";
  return new Date(ts).toLocaleString([], {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
// 24-hour service-window state for the thread header. WhatsApp only lets us send
// free-form text within 24h of the customer's last inbound message; after that
// an approved template is required. Returns a pill label + colour.
function windowRemaining(lastInboundTs?: number, now = Date.now()) {
  const WIN = 24 * 60 * 60 * 1000;
  if (!lastInboundTs) return { open: false, label: "Template only", urgent: false };
  const left = lastInboundTs + WIN - now;
  if (left <= 0) return { open: false, label: "Window closed", urgent: false };
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const label = h > 0 ? `${h}h ${m}m left` : `${m}m left`;
  return { open: true, label, urgent: left < 3_600_000 }; // < 1h → amber
}
function Ticks({ status, error }: { status?: string; error?: { code?: number | null; title?: string; details?: string } | null }) {
  if (!status) return null;
  if (status === "pending") return <span title="pending" style={{ color: C.sub }}>🕓</span>;
  if (status === "failed") {
    // When Meta told us WHY (captured from the status webhook), show the error
    // code inline and the full reason on hover — instead of a bare "Failed".
    const reason = error
      ? `Not delivered — Meta error ${error.code ?? "?"}: ${error.title || error.details || ""}${error.details && error.title ? ` — ${error.details}` : ""}`
      : "Not delivered — the message failed to send (e.g. 24h window closed).";
    return (
      <span title={reason} style={{ color: "#c0392b", fontWeight: 700, fontSize: 10, letterSpacing: 0.2 }}>
        ✗ Failed{error?.code != null ? ` (${error.code})` : ""}
      </span>
    );
  }
  const blue = status === "read";
  const double = status === "delivered" || status === "read";
  return (
    <span title={status} style={{ color: blue ? "#2f6fed" : C.sub, fontSize: 12, letterSpacing: -2 }}>
      {double ? "✓✓" : "✓"}
    </span>
  );
}

export default function InboxPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(MOCK);
  const [keyInput, setKeyInput] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false); // INBOX_SECRET unset (503)
  const [authError, setAuthError] = useState("");

  const [convs, setConvs] = useState<Conversation[]>(MOCK ? MOCK_CONVS : []);
  const [active, setActive] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [tab, setTab] = useState<"all" | "unread">("all"); // chat-list filter
  const [nowTick, setNowTick] = useState(Date.now()); // drives the 24h countdown
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [composing, setComposing] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [search, setSearch] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [tpls, setTpls] = useState<Template[]>([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplError, setTplError] = useState("");
  const [tplSending, setTplSending] = useState("");
  const [tplPick, setTplPick] = useState<Template | null>(null); // template being filled
  const [tplParams, setTplParams] = useState<string[]>([]); // body {{n}} values
  const [tplBtn, setTplBtn] = useState(""); // URL-button suffix (templates that have one)
  // Optional product photo for the template's IMAGE header: paste a product link,
  // we resolve it to that product's photo (else the brand logo is used).
  const [tplProductLink, setTplProductLink] = useState("");
  const [tplHeaderImage, setTplHeaderImage] = useState(""); // resolved product image URL
  const [tplProductName, setTplProductName] = useState("");
  const [tplImgResolving, setTplImgResolving] = useState(false);
  const [tplImgError, setTplImgError] = useState("");
  const [headerMenu, setHeaderMenu] = useState(false);
  const [msgMenuId, setMsgMenuId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null); // message the composer is quoting

  const keyRef = useRef(key);
  const activeRef = useRef(active);
  keyRef.current = key;
  activeRef.current = active;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const docRef = useRef<HTMLInputElement | null>(null);

  // This inbox is a position:fixed full-screen overlay on top of the storefront
  // layout (Navbar/Footer + Lenis smooth-scroll on the window). Lock the page
  // behind it so the browser doesn't show a second, dead scrollbar.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", "x-inbox-key": keyRef.current, ...(init?.headers || {}) },
    });
    return res;
  }, []);

  // --- load conversation list ---
  const loadConvs = useCallback(async () => {
    if (MOCK) return;
    try {
      const res = await api("/api/inbox/conversations");
      if (res.status === 503) { setNeedsSetup(true); setAuthed(false); return; }
      if (res.status === 401) { setAuthed(false); setAuthError("Wrong passcode."); return; }
      const data = await res.json();
      if (data.ok) { setConvs(data.conversations || []); setAuthed(true); setNeedsSetup(false); }
    } catch { /* network blip — keep prior state */ }
  }, [api]);

  // --- load one thread ---
  const loadThread = useCallback(async (phone: string) => {
    if (MOCK) {
      const conv = MOCK_CONVS.find((c) => c.phone === phone);
      setThread({ phone, name: conv?.name || phone, withinWindow: conv?.withinWindow ?? true, lastInboundTs: now - 120000, messages: MOCK_THREADS[phone] || [] });
      return;
    }
    try {
      const res = await api(`/api/inbox/conversations?phone=${encodeURIComponent(phone)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) setThread({ phone: data.phone, name: data.name, withinWindow: data.withinWindow, lastInboundTs: data.lastInboundTs, messages: data.messages || [] });
    } catch { /* ignore */ }
  }, [api]);

  // --- open a conversation ---
  const openConv = useCallback(async (phone: string) => {
    setActive(phone);
    setSendError("");
    setReplyTo(null); // a pending reply belongs to the chat you're leaving
    await loadThread(phone);
    setConvs((prev) => prev.map((c) => (c.phone === phone ? { ...c, unread: 0 } : c)));
    if (!MOCK) api("/api/inbox/conversations", { method: "POST", body: JSON.stringify({ markRead: true, phone }) }).catch(() => {});
  }, [api, loadThread]);

  // --- send a reply ---
  const send = useCallback(async () => {
    const text = draft.trim();
    const phone = activeRef.current;
    if (!text || !phone || sending) return;
    setSending(true);
    setSendError("");
    const rt = replyTo;
    // optimistic
    const optimistic: Message = {
      id: `tmp_${Date.now()}`, dir: "out", text, ts: Date.now(), status: "pending",
      ...(rt ? { quoted: { id: rt.id, text: String(rt.text || "").slice(0, 140), dir: rt.dir } } : {}),
    };
    setThread((t) => (t ? { ...t, messages: [...t.messages, optimistic] } : t));
    setDraft("");
    setReplyTo(null);
    if (MOCK) { setSending(false); return; }
    try {
      const res = await api("/api/inbox/send", { method: "POST", body: JSON.stringify({ to: phone, text, replyTo: rt?.id }) });
      const data = await res.json();
      if (!data.ok) setSendError(typeof data.error === "string" ? data.error : "Send failed.");
      await loadThread(phone);
      loadConvs();
    } catch {
      setSendError("Network error while sending.");
    } finally {
      setSending(false);
    }
  }, [draft, sending, replyTo, api, loadThread, loadConvs]);

  // --- send a photo OR document: upload to Meta, then send by media id ---
  const sendAttachment = useCallback(async (file: File) => {
    const phone = activeRef.current;
    if (!file || !phone || uploading) return;
    setUploading(true);
    setSendError("");
    setAttachOpen(false);
    const caption = draft.trim();
    const rt = replyTo;
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/inbox/upload", {
        method: "POST",
        headers: { "x-inbox-key": keyRef.current },
        body: form,
      });
      const upData = await up.json();
      if (!upData.ok || !upData.mediaId) {
        setSendError(typeof upData.error === "string" ? upData.error : "Upload failed.");
        return;
      }
      const kind = upData.kind === "document" ? "document" : "image";
      const fname = upData.filename || file.name || "";
      // optimistic bubble
      const optimistic: Message = {
        id: `tmp_${Date.now()}`, dir: "out",
        text: caption || (kind === "document" ? `📄 ${fname || "Document"}` : "📷 Photo"),
        ts: Date.now(), status: "pending", type: kind, mediaId: upData.mediaId,
        filename: kind === "document" ? fname : undefined,
        ...(rt ? { quoted: { id: rt.id, text: String(rt.text || "").slice(0, 140), dir: rt.dir } } : {}),
      };
      setThread((t) => (t ? { ...t, messages: [...t.messages, optimistic] } : t));
      setDraft("");
      setReplyTo(null);
      const res = await api("/api/inbox/send", {
        method: "POST",
        body: JSON.stringify({ to: phone, mediaId: upData.mediaId, kind, filename: fname, text: caption, replyTo: rt?.id }),
      });
      const data = await res.json();
      if (!data.ok) setSendError(typeof data.error === "string" ? data.error : "Send failed.");
      await loadThread(phone);
      loadConvs();
    } catch {
      setSendError("Network error while sending the file.");
    } finally {
      setUploading(false);
    }
  }, [draft, uploading, replyTo, api, loadThread, loadConvs]);

  // --- approved templates: load list + send one to this chat ---
  const openTemplates = useCallback(async () => {
    setTplOpen(true);
    setAttachOpen(false);
    setTplError("");
    setTplPick(null);
    if (tpls.length) return;
    setTplLoading(true);
    try {
      const res = await api("/api/templates");
      const data = await res.json();
      if (data.ok) setTpls(data.templates || []);
      else setTplError(typeof data.error === "string" ? data.error : "Could not load templates.");
    } catch {
      setTplError("Network error loading templates.");
    } finally {
      setTplLoading(false);
    }
  }, [api, tpls.length]);

  // Open the fill-in form for a template: {{1}} pre-filled with the customer's
  // name, the rest blank for the operator to type.
  const pickTemplate = useCallback((tpl: Template) => {
    const custName = thread?.name || "";
    setTplPick(tpl);
    setTplParams(Array.from({ length: tpl.bodyVars }, (_, i) => (i === 0 ? custName : "")));
    setTplBtn("");
    setTplProductLink("");
    setTplHeaderImage("");
    setTplProductName("");
    setTplImgError("");
    setSendError("");
  }, [thread?.name]);

  // Resolve a pasted product link to that product's photo, for the IMAGE header.
  const resolveProductImage = useCallback(async () => {
    const link = tplProductLink.trim();
    if (!link) return;
    setTplImgResolving(true);
    setTplImgError("");
    setTplHeaderImage("");
    setTplProductName("");
    try {
      const res = await api(`/api/product-image?link=${encodeURIComponent(link)}`);
      const data = await res.json();
      if (data.ok && data.imageUrl) {
        setTplHeaderImage(data.imageUrl);
        setTplProductName(data.name || "");
      } else {
        setTplImgError(typeof data.error === "string" ? data.error : "Could not find that product.");
      }
    } catch {
      setTplImgError("Network error resolving the product.");
    } finally {
      setTplImgResolving(false);
    }
  }, [api, tplProductLink]);

  // Send the currently-picked template with the operator-entered variables.
  const sendPickedTemplate = useCallback(async () => {
    const phone = activeRef.current;
    const tpl = tplPick;
    if (!phone || !tpl || tplSending) return;
    setTplSending(tpl.name);
    setSendError("");
    try {
      const res = await api("/api/inbox/send-template", {
        method: "POST",
        body: JSON.stringify({
          to: phone,
          templateName: tpl.name,
          languageCode: tpl.language,
          bodyParams: tplParams,
          // Every Viora template has an IMAGE header — use the product photo the
          // operator resolved from a product link if any, else the brand logo, so
          // the send is never rejected for a missing media header.
          ...(tpl.headerFormat === "IMAGE"
            ? { headerImageUrl: tplHeaderImage || DEFAULT_HEADER_IMAGE }
            : {}),
          // A dynamic URL button (review / cart) takes a suffix.
          ...(tpl.hasUrlButton && tplBtn.trim()
            ? { urlButtons: [{ index: String(tpl.urlButtonIndex ?? 0), param: tplBtn.trim() }] }
            : {}),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setSendError(typeof data.error === "string" ? data.error : "Template send failed.");
      } else {
        setTplOpen(false);
        setTplPick(null);
        await loadThread(phone);
        loadConvs();
      }
    } catch {
      setSendError("Network error while sending template.");
    } finally {
      setTplSending("");
    }
  }, [api, tplPick, tplParams, tplBtn, tplHeaderImage, tplSending, loadThread, loadConvs]);

  // --- track viewport so we can switch to a WhatsApp-style single-pane on phones ---
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Go back to the chat list (mobile back arrow).
  const backToList = useCallback(() => {
    setActive(null);
    activeRef.current = null;
    setThread(null);
    setEmojiOpen(false);
    setHeaderMenu(false);
    setMsgMenuId(null);
    setAttachOpen(false);
  }, []);

  // --- delete a single message ("delete for me") ---
  const deleteMsg = useCallback(async (id: string) => {
    const phone = activeRef.current;
    setMsgMenuId(null);
    if (!phone || !id) return;
    setThread((t) => (t ? { ...t, messages: t.messages.filter((m) => m.id !== id) } : t));
    try {
      await api("/api/inbox/conversations", { method: "POST", body: JSON.stringify({ deleteMessage: true, phone, id }) });
      loadConvs();
    } catch { /* optimistic already applied */ }
  }, [api, loadConvs]);

  // --- delete an entire chat ("delete chat") ---
  const deleteChat = useCallback(async () => {
    const phone = activeRef.current;
    if (!phone) return;
    setHeaderMenu(false);
    if (!window.confirm("Delete this whole chat from your inbox?\n\n(It only clears it here — it does NOT delete anything on the customer's WhatsApp.)")) return;
    setConvs((prev) => prev.filter((c) => c.phone !== phone));
    backToList();
    try {
      await api("/api/inbox/conversations", { method: "POST", body: JSON.stringify({ deleteChat: true, phone }) });
    } catch { /* list already updated optimistically */ }
  }, [api, backToList]);

  // --- initial auth: pull saved key, try loading ---
  useEffect(() => {
    if (MOCK) return;
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(KEY_STORE) || "" : "";
    if (saved) { setKey(saved); keyRef.current = saved; }
  }, []);

  useEffect(() => {
    if (MOCK) return;
    if (key) loadConvs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // --- polling ---
  useEffect(() => {
    if (MOCK || !authed) return;
    const id = setInterval(() => {
      loadConvs();
      if (activeRef.current) loadThread(activeRef.current);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [authed, loadConvs, loadThread]);

  // --- keep the 24h countdown fresh (1-min tick; poll already refreshes data) ---
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // --- autoscroll to newest ---
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread?.messages.length, active]);

  const unlock = () => {
    const k = keyInput.trim();
    if (!k) return;
    window.localStorage.setItem(KEY_STORE, k);
    setKey(k); keyRef.current = k;
    setAuthError("");
  };

  // Clear the saved passcode from this device (use before handing the phone/
  // laptop to anyone). Also locks the broadcast page — they share the key.
  const lock = () => {
    window.localStorage.removeItem(KEY_STORE);
    setKey(""); keyRef.current = "";
    setAuthed(false);
    setConvs([]); setThread(null); setActive(null); activeRef.current = null;
    setKeyInput("");
  };

  // Start a chat with a manually-entered number (WhatsApp-style "new chat").
  // A bare 10-digit number is assumed to be Indian (+91). NOTE: WhatsApp only
  // allows a free-form text to a NEW number if they messaged you in the last
  // 24h — otherwise an approved template is required, so the composer will be
  // locked for a truly cold number.
  const startNewChat = () => {
    let phone = newPhone.replace(/[^\d]/g, "");
    if (phone.length === 10) phone = "91" + phone; // default to India
    if (phone.length < 11) return; // too short to be a valid international number
    setComposing(false);
    setNewPhone("");
    openConv(phone);
  };

  // --- setup-needed screen ---
  if (needsSetup) {
    return (
      <Centered>
        <h2 style={{ color: C.plum, margin: "0 0 8px" }}>Inbox not configured</h2>
        <p style={{ color: C.sub, maxWidth: 420, textAlign: "center" }}>
          Set an <code>INBOX_SECRET</code> environment variable in Vercel (any strong passphrase),
          redeploy, then reload this page and enter that passcode.
        </p>
      </Centered>
    );
  }

  // --- passcode gate ---
  if (!authed && !MOCK) {
    return (
      <Centered>
        <div style={{ width: 330, background: C.bgList, padding: 30, borderRadius: 18, boxShadow: "0 12px 40px rgba(90,10,24,.14)", border: `1px solid ${C.border}`, borderTop: `3px solid ${C.gold}` }}>
          <h2 style={{ color: C.plum, margin: "0 0 2px", fontSize: 30, fontFamily: SERIF, fontWeight: 600 }}>Viora Inbox</h2>
          <div style={{ width: 40, height: 2, background: C.gold, margin: "0 0 12px" }} />
          <p style={{ color: C.sub, margin: "0 0 18px", fontSize: 13 }}>Enter the inbox passcode.</p>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && unlock()}
            placeholder="Passcode"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 15, marginBottom: 12, boxSizing: "border-box" }}
          />
          {authError && <div style={{ color: "#c0392b", fontSize: 13, marginBottom: 10 }}>{authError}</div>}
          <button onClick={unlock} style={btn(C.plum)}>Unlock</button>
        </div>
      </Centered>
    );
  }

  const canType = thread?.withinWindow !== false;

  // WhatsApp-style single-pane on phones: show the LIST, or the open THREAD, not
  // both. On desktop both panes show side by side as before.
  const viewingThread = !!active;
  const showList = !isMobile || !viewingThread;
  const showThread = !isMobile || viewingThread;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", height: "100dvh", background: C.bgChat, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: C.text }}>
      {/* LEFT: conversation list */}
      {showList && (
      <aside style={{ width: isMobile ? "100%" : 340, minWidth: isMobile ? 0 : 300, borderRight: isMobile ? "none" : `1px solid ${C.border}`, background: C.bgList, display: "flex", flexDirection: "column", }}>
        <header style={{ background: HEADER_BG, color: "#fff", padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `2px solid ${C.gold}` }}>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontFamily: SERIF, fontSize: 25, fontWeight: 600, letterSpacing: 0.3 }}>Viora</span>
            <span style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: C.gold, marginTop: 2 }}>Inbox</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: C.gold, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: MOCK ? C.sub : "#3ecf6a", display: "inline-block", boxShadow: MOCK ? "none" : "0 0 0 2px rgba(62,207,106,.25)" }} />
              {MOCK ? "MOCK" : "Live"}
            </span>
            {!MOCK && (
              <button
                onClick={lock}
                title="Log out — you'll need the passcode again next time"
                style={{ background: "rgba(255,255,255,.16)", color: "#fff", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12, lineHeight: 1, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                🔓 Log out
              </button>
            )}
            <button
              onClick={() => setComposing((v) => !v)}
              title="New chat"
              style={{ background: "rgba(255,255,255,.18)", color: "#fff", border: "none", borderRadius: "50%", width: 30, height: 30, fontSize: 20, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {composing ? "×" : "+"}
            </button>
          </div>
        </header>

        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, background: "#fff" }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍  Search name or number"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 18, border: `1px solid ${C.border}`, fontSize: 13, background: C.bgChat, boxSizing: "border-box" }}
          />
        </div>

        {/* All / Unread filter tabs */}
        <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, background: C.bgList }}>
          {([["all", "All"], ["unread", "Unread"]] as const).map(([id, lbl]) => {
            const on = tab === id;
            const count = id === "unread" ? convs.filter((c) => c.unread > 0).length : 0;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  border: `1px solid ${on ? C.plum : C.border}`,
                  background: on ? C.plum : "transparent",
                  color: on ? "#fff" : C.sub,
                  borderRadius: 16, padding: "5px 16px", fontSize: 12.5, fontWeight: 600,
                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
                }}
              >
                {lbl}
                {id === "unread" && count > 0 && (
                  <span style={{ background: on ? C.gold : C.plum, color: on ? C.plumDark : "#fff", borderRadius: 9, fontSize: 10, minWidth: 16, height: 16, padding: "0 4px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {composing && (
          <div style={{ padding: 14, borderBottom: `1px solid ${C.border}`, background: C.bgChat }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: C.plum, fontFamily: SERIF }}>New chat</div>
            <input
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startNewChat()}
              placeholder="Phone e.g. 9812345678 or 919812345678"
              style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={startNewChat} disabled={newPhone.replace(/[^\d]/g, "").length < 10} style={{ ...btn(C.plum), width: "auto", padding: "8px 18px", fontSize: 14, opacity: newPhone.replace(/[^\d]/g, "").length < 10 ? 0.5 : 1 }}>Start chat</button>
              <button onClick={() => { setComposing(false); setNewPhone(""); }} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 18px", fontSize: 14, cursor: "pointer", color: C.sub }}>Cancel</button>
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginTop: 8, lineHeight: 1.4 }}>
              10 digits = India (+91) auto-added. ⚠️ You can send a free-form message only if they messaged you in the last 24h — otherwise WhatsApp needs an approved template.
            </div>
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1 }}>
          {convs.length === 0 && (
            <div style={{ padding: 24, color: C.sub, fontSize: 14, textAlign: "center" }}>
              No conversations yet. Customer replies will appear here.
            </div>
          )}
          {(() => {
            const q = search.trim().toLowerCase();
            const digits = q.replace(/[^\d]/g, "");
            const base = tab === "unread" ? convs.filter((c) => c.unread > 0) : convs;
            const shown = q
              ? base.filter(
                  (c) =>
                    (c.name || "").toLowerCase().includes(q) ||
                    (digits && c.phone.includes(digits))
                )
              : base;
            if (convs.length > 0 && shown.length === 0) {
              return (
                <div style={{ padding: 24, color: C.sub, fontSize: 14, textAlign: "center" }}>
                  {tab === "unread" && !q ? "No unread chats — you're all caught up. ✨" : `No chats match “${search}”.`}
                </div>
              );
            }
            return shown.map((c) => {
            const isActive = c.phone === active;
            return (
              <button
                key={c.phone}
                onClick={() => openConv(c.phone)}
                style={{
                  width: "100%", textAlign: "left", border: "none", cursor: "pointer",
                  background: isActive ? C.outBubble : "transparent",
                  padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
                  display: "flex", gap: 12, alignItems: "center",
                }}
              >
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: GOLD_BG, color: C.plumDark, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: SERIF, fontSize: 19, flexShrink: 0, boxShadow: "0 1px 4px rgba(90,10,24,.12)" }}>
                  {(c.name || c.phone).slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name || `+${c.phone}`}</span>
                    <span style={{ fontSize: 11, color: C.sub, flexShrink: 0 }}>{listTime(c.lastTs)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
                    <span style={{ fontSize: 13, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.lastText}</span>
                    {c.unread > 0 && (
                      <span style={{ background: C.plum, color: "#fff", borderRadius: 10, fontSize: 11, minWidth: 18, height: 18, padding: "0 5px", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.unread}</span>
                    )}
                  </div>
                </div>
              </button>
            );
            });
          })()}
        </div>
      </aside>
      )}

      {/* RIGHT: thread */}
      {showThread && (
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {!thread ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 40 }}>💬</div>
            <div>Select a conversation to start replying.</div>
          </div>
        ) : (
          <>
            <header style={{ background: HEADER_BG, color: "#fff", padding: "12px 18px", display: "flex", alignItems: "center", gap: 12, borderBottom: `2px solid ${C.gold}` }}>
              {isMobile && (
                <button onClick={backToList} title="Back" aria-label="Back to chats" style={{ background: "transparent", border: "none", color: C.gold, fontSize: 26, lineHeight: 1, cursor: "pointer", padding: "0 4px 0 0", marginLeft: -4 }}>
                  ‹
                </button>
              )}
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: GOLD_BG, color: C.plumDark, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: SERIF, fontSize: 19, flexShrink: 0 }}>
                {(thread.name || thread.phone).slice(0, 1).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 16, fontFamily: SERIF, letterSpacing: 0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{thread.name || `+${thread.phone}`}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)" }}>+{thread.phone}</div>
              </div>
              {(() => {
                const win = windowRemaining(thread.lastInboundTs, nowTick);
                const bg = win.open ? (win.urgent ? "rgba(201,166,107,.22)" : "rgba(62,207,106,.18)") : "rgba(255,255,255,.1)";
                const fg = win.open ? (win.urgent ? C.gold : "#7be6a0") : "rgba(255,255,255,.72)";
                const border = win.open ? (win.urgent ? C.gold : "rgba(62,207,106,.5)") : "rgba(255,255,255,.25)";
                return (
                  <span title={win.open ? "Free-form reply window (24h since their last message)" : "24h window closed — only an approved template can be sent"}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", padding: "4px 10px", borderRadius: 20, background: bg, color: fg, border: `1px solid ${border}` }}>
                    {win.open ? "⏱" : "🔒"} {win.label}
                  </span>
                );
              })()}
              <div style={{ position: "relative" }}>
                <button onClick={() => setHeaderMenu((v) => !v)} title="Chat options" style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}>⋮</button>
                {headerMenu && (
                  <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,.16)", overflow: "hidden", zIndex: 8, minWidth: 160 }}>
                    <button onClick={deleteChat} style={{ ...menuItem, color: "#c0392b", whiteSpace: "nowrap" }}>🗑 Delete chat</button>
                  </div>
                )}
              </div>
            </header>

            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 8 }}>
              {thread.messages.map((m, i) => {
                const out = m.dir === "out";
                const prev = thread.messages[i - 1];
                const showDay = !prev || dayLabel(prev.ts) !== dayLabel(m.ts);
                // An image bubble can come from a public URL (template header
                // photo) or a proxied Meta media id (a sent/received photo).
                const isImage = m.type === "image" && (!!m.mediaId || !!m.imageUrl);
                const isDoc = m.type === "document";
                const isLocation = m.type === "location" && !!m.location;
                const proxy = m.mediaId
                  ? `/api/inbox/media?id=${encodeURIComponent(m.mediaId)}&key=${encodeURIComponent(key)}`
                  : "";
                const imgSrc = m.imageUrl || proxy;
                const placeholder =
                  m.text === "📷 Photo" ||
                  m.text === "📍 Location" ||
                  m.text === `📄 ${m.filename || "Document"}`;
                const caption = m.text && !placeholder ? m.text : "";
                // Quoted preview: an outbound reply carries a snapshot; an inbound
                // reply carries only the quoted id, resolved from the thread here.
                const quotedPreview =
                  m.quoted ||
                  (m.quotedId
                    ? (() => {
                        const q = thread.messages.find((x) => x.id === m.quotedId);
                        return q ? { id: q.id, text: q.text, dir: q.dir } : null;
                      })()
                    : null);
                return (
                  <div key={m.id} style={{ display: "contents" }}>
                    {showDay && (
                      <div style={{ alignSelf: "center", background: C.cream2, color: C.sub, fontSize: 11, padding: "3px 12px", borderRadius: 10, margin: "6px 0" }}>
                        {dayLabel(m.ts)}
                      </div>
                    )}
                    <div style={{ alignSelf: out ? "flex-end" : "flex-start", maxWidth: "72%", position: "relative" }}>
                      {msgMenuId === m.id && (
                        <div style={{ position: "absolute", top: 0, [out ? "right" : "left"]: 0, transform: "translateY(-108%)", zIndex: 7, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,.16)", overflow: "hidden" }}>
                          <button onClick={() => { setReplyTo(m); setMsgMenuId(null); }} style={{ ...menuItem, whiteSpace: "nowrap", fontSize: 13, color: C.plum }}>↩ Reply</button>
                          <button onClick={() => deleteMsg(m.id)} style={{ ...menuItem, color: "#c0392b", whiteSpace: "nowrap", fontSize: 13 }}>🗑 Delete for me</button>
                        </div>
                      )}
                      <div title={fullStamp(m.ts)} style={{ background: out ? C.outBubble : C.inBubble, border: `1px solid ${C.border}`, borderLeft: m.template ? `3px solid ${C.gold}` : `1px solid ${C.border}`, borderRadius: 12, padding: isImage ? 4 : "8px 11px", fontSize: 14, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {m.template && (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.goldDark, background: "rgba(201,166,107,.16)", border: `1px solid ${C.gold}`, borderRadius: 5, padding: "1px 6px", marginBottom: 5 }}>
                            ✦ Template
                          </div>
                        )}
                        {quotedPreview && (
                          <div style={{ borderLeft: `3px solid ${C.gold}`, background: "rgba(0,0,0,.045)", borderRadius: 6, padding: "3px 8px", marginBottom: 5, maxWidth: "100%", overflow: "hidden" }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.plum }}>
                              {quotedPreview.dir === "out" ? "You" : (thread.name || "Customer")}
                            </div>
                            <div style={{ fontSize: 12, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {quotedPreview.text || "Media"}
                            </div>
                          </div>
                        )}
                        {isLocation && m.location && (
                          <a href={`https://www.google.com/maps?q=${m.location.lat},${m.location.long}`} target="_blank" rel="noreferrer"
                            style={{ display: "flex", gap: 9, alignItems: "flex-start", textDecoration: "none", color: C.text, padding: "2px 2px 4px" }}>
                            <span style={{ fontSize: 26, lineHeight: 1 }}>📍</span>
                            <span>
                              <span style={{ display: "block", fontWeight: 600 }}>{m.location.name || "Location"}</span>
                              <span style={{ display: "block", fontSize: 12, color: C.sub }}>
                                {m.location.address || `${m.location.lat.toFixed(5)}, ${m.location.long.toFixed(5)}`}
                              </span>
                              <span style={{ display: "block", fontSize: 12, color: C.goldDark, marginTop: 2, fontWeight: 600 }}>Open in Maps →</span>
                            </span>
                          </a>
                        )}
                        {isImage && imgSrc && (
                          <a href={imgSrc} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={imgSrc} alt={caption || "Photo"} style={{ maxWidth: "100%", width: 240, maxHeight: 280, objectFit: "cover", borderRadius: 9, display: "block" }} />
                          </a>
                        )}
                        {isDoc && (
                          <a href={proxy || "#"} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, color: C.plum, textDecoration: "none", padding: "2px 2px 6px" }}>
                            <span style={{ fontSize: 22 }}>📄</span>
                            <span style={{ fontWeight: 600, wordBreak: "break-all" }}>{m.filename || "Document"}</span>
                          </a>
                        )}
                        <div style={{ padding: isImage ? "4px 7px 2px" : 0 }}>
                          {caption || (isImage || isDoc || isLocation ? "" : m.text)}
                          <span style={{ float: "right", marginLeft: 10, marginTop: 6, fontSize: 10, color: C.sub, display: "inline-flex", gap: 4, alignItems: "center" }}>
                            <button onClick={(e) => { e.stopPropagation(); setMsgMenuId((cur) => (cur === m.id ? null : m.id)); }} title="Message options" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: C.sub, padding: 0, lineHeight: 1 }}>⋮</button>
                            {clock(m.ts)} {out && <Ticks status={m.status} error={m.error} />}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* composer */}
            <div style={{ borderTop: `1px solid ${C.border}`, background: "#fff", padding: 12 }}>
              {sendError && <div style={{ color: "#c0392b", fontSize: 12, marginBottom: 8 }}>{sendError}</div>}
              {/* hidden pickers — available whether or not the window is open */}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) sendAttachment(f); e.target.value = ""; }} />
              <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) sendAttachment(f); e.target.value = ""; }} />

              {replyTo && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.cream2, borderLeft: `3px solid ${C.gold}`, borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.plum }}>
                      Replying to {replyTo.dir === "out" ? "yourself" : (thread.name || "customer")}
                    </div>
                    <div style={{ fontSize: 12, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {replyTo.text || "Media"}
                    </div>
                  </div>
                  <button onClick={() => setReplyTo(null)} title="Cancel reply" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18, color: C.sub, lineHeight: 1 }}>×</button>
                </div>
              )}

              {!canType ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", padding: "6px 4px" }}>
                  <div style={{ color: C.sub, fontSize: 13, textAlign: "center" }}>
                    ⏳ 24-hour reply window closed. WhatsApp allows only an approved <b>template</b> now.
                  </div>
                  <button onClick={openTemplates} style={{ ...btn(C.plum), width: "auto", padding: "10px 22px" }}>📄 Send a template</button>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  {emojiOpen && (
                    <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 8, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 6px 24px rgba(0,0,0,.12)", padding: 8, display: "flex", flexWrap: "wrap", gap: 4, width: 268, maxHeight: 160, overflowY: "auto", zIndex: 5 }}>
                      {EMOJIS.map((e) => (
                        <button key={e} onClick={() => { setDraft((d) => d + e); setEmojiOpen(false); }} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", width: 34, height: 34, borderRadius: 8 }}>
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                  {attachOpen && (
                    <div style={{ position: "absolute", bottom: "100%", left: 74, marginBottom: 8, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 6px 24px rgba(0,0,0,.12)", padding: 6, zIndex: 5, minWidth: 150 }}>
                      <button onClick={() => { setAttachOpen(false); fileRef.current?.click(); }} style={menuItem}>🖼️ Photo</button>
                      <button onClick={() => { setAttachOpen(false); docRef.current?.click(); }} style={menuItem}>📄 Document</button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                    <button onClick={openTemplates} title="Send approved template" style={iconBtn}>🗒️</button>
                    <button onClick={() => setEmojiOpen((v) => !v)} title="Emoji" style={iconBtn}>😊</button>
                    <button onClick={() => setAttachOpen((v) => !v)} disabled={uploading} title="Attach photo or document" style={{ ...iconBtn, opacity: uploading ? 0.5 : 1 }}>
                      {uploading ? "…" : "📎"}
                    </button>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                      placeholder="Type a reply…  (Enter to send, Shift+Enter for newline)"
                      rows={1}
                      style={{ flex: 1, resize: "none", maxHeight: 120, padding: "10px 12px", borderRadius: 20, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }}
                    />
                    <button onClick={send} disabled={sending || !draft.trim()} style={{ ...btn(C.plum), width: "auto", padding: "10px 18px", opacity: sending || !draft.trim() ? 0.5 : 1 }}>
                      {sending ? "…" : "Send"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
      )}

      {/* click-away layer to dismiss the header / message option menus */}
      {(headerMenu || msgMenuId) && (
        <div onClick={() => { setHeaderMenu(false); setMsgMenuId(null); }} style={{ position: "fixed", inset: 0, zIndex: 6 }} />
      )}

      {/* Send-approved-template modal */}
      {tplOpen && (
        <div onClick={() => setTplOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, maxHeight: "82vh", overflowY: "auto", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h3 style={{ margin: 0, color: C.plum, fontSize: 22, fontFamily: SERIF, fontWeight: 600 }}>Send a template</h3>
              <button onClick={() => setTplOpen(false)} style={{ background: "transparent", border: "none", fontSize: 24, lineHeight: 1, cursor: "pointer", color: C.sub }}>×</button>
            </div>
            {!tplPick ? (
              <>
                <p style={{ color: C.sub, fontSize: 12.5, margin: "0 0 10px" }}>
                  Pick a template — it reaches the customer even outside the 24-hour window. <b>{"{{1}}"}</b> pre-fills {thread?.name || "the customer"}’s name; you fill any other fields.
                </p>
                {tplLoading && <div style={{ color: C.sub, fontSize: 13, padding: "12px 0" }}>Loading templates…</div>}
                {tplError && <div style={{ color: "#c0392b", fontSize: 13 }}>{tplError}</div>}
                {!tplLoading && !tplError && tpls.length === 0 && <div style={{ color: C.sub, fontSize: 13 }}>No approved templates found.</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                  {tpls.map((t) => (
                    <button
                      key={`${t.name}:${t.language}`}
                      onClick={() => pickTemplate(t)}
                      style={{ textAlign: "left", cursor: "pointer", border: `1px solid ${C.border}`, background: C.bgList, borderRadius: 12, padding: "10px 12px", transition: "border-color .12s" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <strong style={{ fontSize: 13, color: C.text }}>{t.name}</strong>
                        <span style={{ display: "flex", gap: 5 }}>
                          {t.headerFormat === "IMAGE" && <span style={{ fontSize: 10, color: C.sub, border: `1px solid ${C.border}`, borderRadius: 6, padding: "1px 6px" }}>🖼</span>}
                          <span style={{ fontSize: 10, color: C.sub, border: `1px solid ${C.border}`, borderRadius: 6, padding: "1px 6px" }}>{t.language}</span>
                        </span>
                      </div>
                      <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4, whiteSpace: "pre-wrap", maxHeight: 66, overflow: "hidden" }}>{t.bodyText}</div>
                      <div style={{ fontSize: 11, color: C.goldDark, marginTop: 8, fontWeight: 600 }}>
                        {t.bodyVars > 0 ? `${t.bodyVars} field${t.bodyVars === 1 ? "" : "s"} to fill →` : "Ready to send →"}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              (() => {
                const t = tplPick;
                const filled = tplParams.every((v) => v.trim()) && (!t.hasUrlButton || !!tplBtn.trim());
                const busy = tplSending === t.name;
                // Show the body with each {{n}} replaced by the live value so the
                // operator sees exactly what the customer will get.
                const preview = t.bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => tplParams[Number(n) - 1] || `{{${n}}}`);
                return (
                  <>
                    <button onClick={() => setTplPick(null)} style={{ background: "transparent", border: "none", color: C.plum, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "2px 0 10px", display: "inline-flex", alignItems: "center", gap: 4 }}>‹ All templates</button>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <strong style={{ fontSize: 14, color: C.text }}>{t.name}</strong>
                      <span style={{ fontSize: 10, color: C.sub, border: `1px solid ${C.border}`, borderRadius: 6, padding: "1px 6px" }}>{t.language}</span>
                    </div>
                    {t.headerFormat === "IMAGE" && (
                      <div style={{ marginBottom: 12, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 11px", background: C.bgList }}>
                        <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: C.sub, marginBottom: 5 }}>
                          🖼 Header image — paste a product link to show that product’s photo
                        </label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            value={tplProductLink}
                            onChange={(e) => { setTplProductLink(e.target.value); setTplHeaderImage(""); setTplProductName(""); setTplImgError(""); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); resolveProductImage(); } }}
                            placeholder="https://viorajewel.in/…product-link"
                            style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box" }}
                          />
                          <button
                            onClick={resolveProductImage}
                            disabled={!tplProductLink.trim() || tplImgResolving}
                            style={{ ...btn(C.plum), width: "auto", padding: "8px 14px", fontSize: 13, opacity: !tplProductLink.trim() || tplImgResolving ? 0.5 : 1, cursor: !tplProductLink.trim() || tplImgResolving ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
                          >
                            {tplImgResolving ? "…" : "Load"}
                          </button>
                        </div>
                        {tplImgError && <div style={{ color: "#c0392b", fontSize: 11.5, marginTop: 6 }}>{tplImgError}</div>}
                        {tplHeaderImage ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={tplHeaderImage} alt="product" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}` }} />
                            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4 }}>
                              <div style={{ fontWeight: 600 }}>{tplProductName || "Product image ready"}</div>
                              <button onClick={() => { setTplHeaderImage(""); setTplProductName(""); setTplProductLink(""); }} style={{ background: "transparent", border: "none", color: C.plum, fontSize: 11.5, cursor: "pointer", padding: 0, marginTop: 2 }}>Use brand logo instead</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: C.sub, marginTop: 6 }}>Leave empty to use the Viora logo.</div>
                        )}
                      </div>
                    )}
                    {tplParams.map((v, i) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: C.sub, marginBottom: 4 }}>
                          Variable {`{{${i + 1}}}`}{i === 0 ? " — customer name" : ""}
                        </label>
                        <input
                          value={v}
                          onChange={(e) => setTplParams((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                          placeholder={i === 0 ? "Customer name" : `Value for {{${i + 1}}}`}
                          style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box" }}
                        />
                      </div>
                    ))}
                    {t.hasUrlButton && (
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: C.sub, marginBottom: 4 }}>Button link suffix</label>
                        <input
                          value={tplBtn}
                          onChange={(e) => setTplBtn(e.target.value)}
                          placeholder="e.g. a product slug or code"
                          style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box" }}
                        />
                      </div>
                    )}
                    <div style={{ background: C.bgChat, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 12.5, color: C.text, whiteSpace: "pre-wrap", margin: "4px 0 14px", maxHeight: 140, overflowY: "auto" }}>
                      {preview}
                    </div>
                    <button onClick={sendPickedTemplate} disabled={!filled || !!tplSending} style={{ ...btn(C.plum), padding: "11px 0", opacity: !filled || tplSending ? 0.5 : 1, cursor: !filled || tplSending ? "not-allowed" : "pointer" }}>
                      {busy ? "Sending…" : "Send to " + (thread?.name || "customer")}
                    </button>
                    {!filled && <div style={{ fontSize: 11, color: C.sub, marginTop: 8, textAlign: "center" }}>Fill every field to enable send.</div>}
                  </>
                );
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, background: C.bgChat, fontFamily: "system-ui, sans-serif", padding: 20 }}>
      {children}
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return { width: "100%", background: bg, color: "#fff", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 15, fontWeight: 600, cursor: "pointer" };
}

const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  fontSize: 22,
  lineHeight: 1,
  cursor: "pointer",
  padding: "6px 4px",
  flexShrink: 0,
};

const menuItem: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  padding: "9px 12px",
  fontSize: 14,
  cursor: "pointer",
  borderRadius: 8,
  color: "#1A1410",
};
