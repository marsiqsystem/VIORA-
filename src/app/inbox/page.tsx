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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MOCK = process.env.NEXT_PUBLIC_INBOX_MOCK === "1";
const POLL_MS = 4000;
const KEY_STORE = "viora_inbox_key";
// Every approved Viora template has an IMAGE header; when sending one manually
// from a chat we attach this default header image (the brand logo) so the send
// isn't rejected for a missing media header. Matches the server default.
const DEFAULT_HEADER_IMAGE =
  process.env.NEXT_PUBLIC_WHATSAPP_HEADER_IMAGE || "https://viorajewel.in/email-logo.png";

// A Click-to-WhatsApp ad/post the customer arrived from (Meta `referral`).
type Referral = {
  sourceType?: string; // 'ad' | 'post'
  sourceId?: string;   // ad/post id — matches Ads Manager
  sourceUrl?: string;  // fb.me/… link back to the ad
  headline?: string;   // the ad's headline — the human "which ad"
  body?: string;       // the ad's body text
  mediaType?: string;  // 'image' | 'video'
  imageUrl?: string;
  videoUrl?: string;
  thumbUrl?: string;
  ctwaClid?: string;
  firstReplyTs?: number;
};
type Conversation = {
  phone: string;
  name: string;
  lastText: string;
  lastTs: number;
  unread: number;
  withinWindow: boolean;
  referral?: Referral | null;
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
  referral?: Referral | null; // set when THIS inbound message came from a Click-to-WhatsApp ad
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
  referral?: Referral | null; // first-touch Click-to-WhatsApp ad for this chat
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
// Serif display face (Noto Serif Display) supplied by the root layout.
const SERIF = "var(--font-heading), Georgia, 'Times New Roman', serif";

// --- mock seed data ----------------------------------------------------------
const now = Date.now();
const MOCK_CONVS: Conversation[] = [
  { phone: "918100460566", name: "Zeeshan", lastText: "Order kab tak aayega?", lastTs: now - 120000, unread: 2, withinWindow: true, referral: { sourceType: "ad", sourceId: "120210000000123456", sourceUrl: "https://fb.me/xyz", headline: "Rakhi Luxe Gift Set — Flat 20% Off", body: "Handcrafted jewellery gifts. Free shipping.", mediaType: "image" } },
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

// A compact "came from an ad" pill for the conversation list — the at-a-glance
// answer to "which ad did this response come from?". Falls back to the ad/post
// id when the ad had no headline text.
function AdBadge({ referral }: { referral?: Referral | null }) {
  if (!referral) return null;
  const label =
    referral.headline?.trim() ||
    (referral.sourceType === "post" ? "Instagram/FB post" : `Ad ${referral.sourceId || ""}`.trim());
  return (
    <span
      title={`This customer arrived from a Click-to-WhatsApp ${referral.sourceType || "ad"}${referral.headline ? `: ${referral.headline}` : ""}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%",
        marginTop: 4, fontSize: 10.5, fontWeight: 700, lineHeight: 1.2,
        color: C.plumDark, background: "rgba(201,166,107,.20)", border: `1px solid ${C.gold}`,
        borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}
    >
      📣 <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </span>
  );
}

// The full ad-source card shown at the top of a thread: creative thumbnail,
// headline + body, the source type/id (matches Ads Manager) and a link back to
// the actual ad. This is how the operator knows exactly which campaign creative
// drove this WhatsApp conversation.
function AdCard({ referral }: { referral?: Referral | null }) {
  if (!referral) return null;
  const isPost = referral.sourceType === "post";
  const title = referral.headline?.trim() || (isPost ? "Instagram / Facebook post" : "Click-to-WhatsApp ad");
  const thumb = referral.imageUrl || referral.thumbUrl || "";
  return (
    <div style={{ background: C.bgList, borderBottom: `1px solid ${C.border}`, padding: "10px 16px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "rgba(201,166,107,.12)", border: `1px solid ${C.gold}`, borderRadius: 10, padding: 10 }}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="Ad creative" style={{ width: 46, height: 46, borderRadius: 8, objectFit: "cover", flexShrink: 0, border: `1px solid ${C.border}` }} />
        ) : (
          <div style={{ width: 46, height: 46, borderRadius: 8, background: GOLD_BG, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>📣</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.goldDark }}>
            Came from {isPost ? "a post" : "an ad"}{referral.mediaType ? ` · ${referral.mediaType}` : ""}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          {referral.body && (
            <div style={{ fontSize: 12, color: C.sub, marginTop: 1, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{referral.body}</div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4, alignItems: "center" }}>
            {referral.sourceId && (
              <span style={{ fontSize: 10.5, color: C.sub }}>
                {isPost ? "Post" : "Ad"} ID: <code style={{ fontSize: 10.5, color: C.plum, userSelect: "all" }}>{referral.sourceId}</code>
              </span>
            )}
            {referral.sourceUrl && (
              <a href={referral.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontWeight: 700, color: C.plum, textDecoration: "none" }}>
                View {isPost ? "post" : "ad"} ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Frequently-pasted long replies (order confirmation + ad product-link). Kept as a
// separate list so they can also be back-filled into an operator's saved quick-replies
// via a one-time seed migration (see SEEDED_QR_VERSION below).
const SEEDED_QUICK_REPLIES = [
  "Your order #_____ is Confirmed ✅ You will receive the tracking link as soon as your order is picked up by the courier.\nNote - Do not share any type of OTP with any delivery executive as we don't take any kind of OTPs for COD orders.\nExchange policy is available for damaged products if you inform us within 48 hours of delivery.\nThank You,\nViora Jewels",
  "Hello, Welcome to Viora Jewels 💎\nHere is the direct link of the product:\nhttps://www.viorajewel.in/rosa-blush-set\nIt's ₹519 only and if you do prepaid payment you will get another ₹25 discount!",
];

// Starter quick-replies (operator can edit/add; stored in localStorage after that).
const DEFAULT_QUICK_REPLIES = [
  "Hello! Thank you for contacting Viora Jewels 💎 How can we help you?",
  "Please share your full address with pincode so we can confirm your order. 🙏",
  "Your order is confirmed ✅ — we will dispatch it shortly.",
  "Your order has been shipped 🚚 You'll receive tracking details soon.",
  "Could you please confirm your order by replying YES?",
  "Thank you for shopping with Viora Jewels! ❤️",
  ...SEEDED_QUICK_REPLIES,
];

// Bump this when SEEDED_QUICK_REPLIES changes; new entries are appended once to an
// operator's already-saved quick-replies (deletions they made are preserved).
const SEEDED_QR_VERSION = 1;

// Render message text with clickable links (ops/customers paste product URLs a lot).
const URL_RE = /(https?:\/\/[^\s]+)/g;
function linkify(text: string): React.ReactNode {
  if (!text) return text;
  const parts = text.split(URL_RE);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
        style={{ color: "#1a6fd4", textDecoration: "underline", wordBreak: "break-all" }}>{part}</a>
    ) : (
      <span key={i}>{part}</span>
    )
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
  const videoRef = useRef<HTMLInputElement | null>(null);
  const docRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLInputElement | null>(null);
  const lastConvSig = useRef<string>("");   // skip re-render when a poll returns identical data
  const lastThreadSig = useRef<string>("");
  const [lightbox, setLightbox] = useState<string | null>(null);  // full-screen image viewer
  const [dragOver, setDragOver] = useState(false);                // drag-and-drop file overlay
  const [highlightId, setHighlightId] = useState<string | null>(null); // flash a jumped-to message
  const [atBottom, setAtBottom] = useState(true);                 // show the scroll-to-latest button
  const prevUnreadRef = useRef<number>(-1);                        // detect newly-arrived messages

  // --- extra WhatsApp-style features ---
  const [forwarding, setForwarding] = useState<Message | null>(null); // message being forwarded (opens picker)
  const [quickOpen, setQuickOpen] = useState(false);              // quick-replies tray
  const [quickEditing, setQuickEditing] = useState(false);        // quick-replies editor
  const [quickReplies, setQuickReplies] = useState<string[]>(() => {
    try {
      const saved: string[] | null = JSON.parse(localStorage.getItem("viora_inbox_quickreplies") || "null");
      if (!saved) return DEFAULT_QUICK_REPLIES; // fresh operator — full defaults (incl. seeded)
      // One-time back-fill: append any new SEEDED_QUICK_REPLIES this operator hasn't seen yet.
      const seenVer = Number(localStorage.getItem("viora_inbox_quickreplies_seedver") || "0");
      if (seenVer < SEEDED_QR_VERSION) {
        const missing = SEEDED_QUICK_REPLIES.filter((s) => !saved.includes(s));
        localStorage.setItem("viora_inbox_quickreplies_seedver", String(SEEDED_QR_VERSION));
        if (missing.length) return [...saved, ...missing];
      }
      return saved;
    } catch { return DEFAULT_QUICK_REPLIES; }
  });
  const [chatSearchOpen, setChatSearchOpen] = useState(false);    // in-chat find bar
  const [chatSearch, setChatSearch] = useState("");
  const [chatSearchIdx, setChatSearchIdx] = useState(0);
  const [pinned, setPinned] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("viora_inbox_pinned") || "[]") || []; } catch { return []; }
  });
  const [starred, setStarred] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("viora_inbox_starred") || "[]") || []; } catch { return []; }
  });
  const [infoOpen, setInfoOpen] = useState(false);                // contact info side panel
  const [forwardSearch, setForwardSearch] = useState("");         // filter in the forward picker

  // persist the localStorage-backed lists
  useEffect(() => { try { localStorage.setItem("viora_inbox_quickreplies", JSON.stringify(quickReplies)); } catch { /* ignore */ } }, [quickReplies]);
  useEffect(() => { try { localStorage.setItem("viora_inbox_pinned", JSON.stringify(pinned)); } catch { /* ignore */ } }, [pinned]);
  useEffect(() => { try { localStorage.setItem("viora_inbox_starred", JSON.stringify(starred)); } catch { /* ignore */ } }, [starred]);

  const togglePin = useCallback((phone: string) => setPinned((p) => (p.includes(phone) ? p.filter((x) => x !== phone) : [phone, ...p])), []);
  const toggleStar = useCallback((id: string) => setStarred((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])), []);

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

  // short WebAudio chime on a new message (no asset / CSP-safe)
  const beep = useCallback(() => {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine"; o.frequency.value = 680; g.gain.value = 0.06;
      o.start(); o.stop(ctx.currentTime + 0.16);
      setTimeout(() => ctx.close().catch(() => {}), 350);
    } catch { /* ignore */ }
  }, []);
  const notifyNewMessage = useCallback(() => {
    beep();
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
        new Notification("Viora Inbox", { body: "New message received" });
      }
    } catch { /* ignore */ }
  }, [beep]);

  // --- load conversation list ---
  const loadConvs = useCallback(async () => {
    if (MOCK) return;
    try {
      const res = await api("/api/inbox/conversations");
      if (res.status === 503) { setNeedsSetup(true); setAuthed(false); return; }
      if (res.status === 401) { setAuthed(false); setAuthError("Wrong passcode."); return; }
      const data = await res.json();
      if (data.ok) {
        const list = data.conversations || [];
        const sig = JSON.stringify(list);
        if (sig !== lastConvSig.current) { lastConvSig.current = sig; setConvs(list); }
        // new-message alert: total unread went up since the last poll
        const totalUnread = list.reduce((s: number, c: any) => s + (c.unread || 0), 0);
        if (prevUnreadRef.current >= 0 && totalUnread > prevUnreadRef.current) notifyNewMessage();
        prevUnreadRef.current = totalUnread;
        setAuthed(true); setNeedsSetup(false);
      }
    } catch { /* network blip — keep prior state */ }
  }, [api, notifyNewMessage]);

  // --- load one thread ---
  const loadThread = useCallback(async (phone: string) => {
    if (MOCK) {
      const conv = MOCK_CONVS.find((c) => c.phone === phone);
      setThread({ phone, name: conv?.name || phone, withinWindow: conv?.withinWindow ?? true, lastInboundTs: now - 120000, referral: conv?.referral || null, messages: MOCK_THREADS[phone] || [] });
      return;
    }
    try {
      const res = await api(`/api/inbox/conversations?phone=${encodeURIComponent(phone)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) {
        const msgs = data.messages || [];
        const last = msgs[msgs.length - 1];
        // Signature of the server state. If a poll returns the same thread, skip the
        // setThread so we don't re-render / reload every image bubble every few seconds.
        const sig = `${data.phone}|${msgs.length}|${last?.id || ""}|${last?.status || ""}|${data.withinWindow}`;
        if (sig !== lastThreadSig.current) {
          lastThreadSig.current = sig;
          setThread({ phone: data.phone, name: data.name, withinWindow: data.withinWindow, lastInboundTs: data.lastInboundTs, referral: data.referral || null, messages: msgs });
        }
      }
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
      if (!data.ok) {
        setSendError(typeof data.error === "string" ? data.error : "Send failed.");
        lastThreadSig.current = "";   // force the reconcile below to clear the ghost bubble
      } else {
        // mark the optimistic bubble as sent; the background poll reconciles the real id
        setThread((t) => (t ? { ...t, messages: t.messages.map((x) => (x.id === optimistic.id ? { ...x, status: "sent" } : x)) } : t));
      }
      loadThread(phone); loadConvs();   // reconcile in the background — don't block the composer
    } catch {
      setSendError("Network error while sending.");
    } finally {
      setSending(false);
    }
  }, [draft, sending, replyTo, api, loadThread, loadConvs]);

  // --- send one or many photos / a video / a document ---
  // Each file is uploaded to Meta then sent by media id. Several images can be
  // picked and sent in one go; the typed caption and any reply quote attach to
  // the first item only (WhatsApp-style). Reconciles once at the end.
  const sendAttachments = useCallback(async (files: File[]) => {
    const phone = activeRef.current;
    if (!files.length || !phone || uploading) return;
    setUploading(true);
    setSendError("");
    setAttachOpen(false);
    const caption0 = draft.trim();
    const rt = replyTo;
    setDraft("");
    setReplyTo(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const caption = i === 0 ? caption0 : "";
        const quoted = i === 0 && rt ? { id: rt.id, text: String(rt.text || "").slice(0, 140), dir: rt.dir } : undefined;
        const form = new FormData();
        form.append("file", file);
        const up = await fetch("/api/inbox/upload", { method: "POST", headers: { "x-inbox-key": keyRef.current }, body: form });
        const upData = await up.json();
        if (!upData.ok || !upData.mediaId) {
          setSendError(typeof upData.error === "string" ? upData.error : `Upload failed for ${file.name || "a file"}.`);
          continue;
        }
        const kind: string = upData.kind || "image";   // image | video | audio | document
        const fname = upData.filename || file.name || "";
        const placeholder = kind === "document" ? `📄 ${fname || "Document"}` : kind === "video" ? "🎥 Video" : kind === "audio" ? "🎵 Audio" : "📷 Photo";
        const optimistic: Message = {
          id: `tmp_${Date.now()}_${i}`, dir: "out",
          text: kind === "audio" ? "🎵 Audio" : (caption || placeholder),
          ts: Date.now(), status: "pending", type: kind, mediaId: upData.mediaId,
          filename: kind === "document" ? fname : undefined,
          ...(quoted ? { quoted } : {}),
        };
        setThread((t) => (t ? { ...t, messages: [...t.messages, optimistic] } : t));
        const res = await api("/api/inbox/send", {
          method: "POST",
          body: JSON.stringify({ to: phone, mediaId: upData.mediaId, kind, filename: fname, text: caption, replyTo: quoted ? rt?.id : undefined }),
        });
        const data = await res.json();
        if (!data.ok) { setSendError(typeof data.error === "string" ? data.error : "Send failed."); lastThreadSig.current = ""; }
      }
      loadThread(phone); loadConvs();   // reconcile once, in the background
    } catch {
      setSendError("Network error while sending the file(s).");
    } finally {
      setUploading(false);
    }
  }, [draft, uploading, replyTo, api, loadThread, loadConvs]);

  const sendAttachment = useCallback((file: File) => sendAttachments([file]), [sendAttachments]);

  // Route dropped / pasted files straight into the attachment sender.
  const handleFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length) sendAttachments(arr);
  }, [sendAttachments]);

  // Scroll to, and briefly flash, a quoted message when its preview is tapped.
  const jumpToMessage = useCallback((id?: string) => {
    if (!id) return;
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(id);
    setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 1600);
  }, []);

  // Forward the picked message to another conversation, then open that chat.
  const forwardTo = useCallback(async (toPhone: string) => {
    const m = forwarding;
    setForwarding(null);
    if (!m || !toPhone) return;
    try {
      const body = m.mediaId
        ? { to: toPhone, mediaId: m.mediaId, kind: m.type, filename: m.filename }
        : { to: toPhone, text: m.text };
      const res = await api("/api/inbox/send", { method: "POST", body: JSON.stringify(body) });
      const data = await res.json();
      if (!data.ok) { setSendError(typeof data.error === "string" ? data.error : "Forward failed (target's 24h window may be closed)."); return; }
      openConv(toPhone);
    } catch { setSendError("Network error while forwarding."); }
  }, [forwarding, api, openConv]);

  // Insert a saved quick-reply into the composer (operator can tweak, then send).
  const insertQuickReply = useCallback((txt: string) => {
    setDraft((d) => (d.trim() ? d + " " + txt : txt));
    setQuickOpen(false);
  }, []);

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
    setAtBottom(true);
  }, [thread?.messages.length, active]);

  // ask for desktop-notification permission once the operator is in
  useEffect(() => {
    if (authed && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [authed]);

  // Esc closes the lightbox / cancels a reply / shuts open menus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (lightbox) { setLightbox(null); return; }
      if (replyTo) { setReplyTo(null); return; }
      if (attachOpen || emojiOpen) { setAttachOpen(false); setEmojiOpen(false); return; }
      if (msgMenuId || headerMenu) { setMsgMenuId(null); setHeaderMenu(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, replyTo, attachOpen, emojiOpen, msgMenuId, headerMenu]);

  // in-chat search: ids of messages whose text matches the find bar
  const searchMatches = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    if (!q || !thread) return [] as string[];
    return thread.messages.filter((m) => (m.text || "").toLowerCase().includes(q)).map((m) => m.id);
  }, [chatSearch, thread]);
  useEffect(() => {
    if (!chatSearchOpen || searchMatches.length === 0) return;
    const idx = Math.min(chatSearchIdx, searchMatches.length - 1);
    jumpToMessage(searchMatches[idx]);
  }, [chatSearchIdx, searchMatches, chatSearchOpen, jumpToMessage]);
  const searchMatchSet = useMemo(() => new Set(searchMatches), [searchMatches]);

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
            <a href="/dashboard" style={{ color: C.gold, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", textDecoration: "none" }}>← Dashboard</a>
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
          <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 11, color: C.sub }}>{convs.length} chats</span>
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
                    (c.lastText || "").toLowerCase().includes(q) ||
                    !!(digits && c.phone.includes(digits))
                )
              : base;
            if (convs.length > 0 && shown.length === 0) {
              return (
                <div style={{ padding: 24, color: C.sub, fontSize: 14, textAlign: "center" }}>
                  {tab === "unread" && !q ? "No unread chats — you're all caught up. ✨" : `No chats match “${search}”.`}
                </div>
              );
            }
            const pinnedSet = new Set(pinned);
            const ordered = [...shown].sort((a, b) => (pinnedSet.has(b.phone) ? 1 : 0) - (pinnedSet.has(a.phone) ? 1 : 0));
            return ordered.map((c) => {
            const isActive = c.phone === active;
            const isPinned = pinnedSet.has(c.phone);
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
                    <span style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{isPinned ? "📌 " : ""}{c.name || `+${c.phone}`}</span>
                    <span style={{ fontSize: 11, color: C.sub, flexShrink: 0 }}>{listTime(c.lastTs)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
                    <span style={{ fontSize: 13, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.lastText}</span>
                    {c.unread > 0 && (
                      <span style={{ background: C.plum, color: "#fff", borderRadius: 10, fontSize: 11, minWidth: 18, height: 18, padding: "0 5px", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.unread}</span>
                    )}
                  </div>
                  {c.referral && (
                    <div style={{ marginTop: 2 }}>
                      <AdBadge referral={c.referral} />
                    </div>
                  )}
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
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
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
              <button onClick={() => { setChatSearchOpen((v) => !v); setChatSearch(""); setChatSearchIdx(0); }} title="Search in chat" style={{ background: "transparent", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}>🔍</button>
              <button onClick={() => setInfoOpen((v) => !v)} title="Contact info" style={{ background: "transparent", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}>ℹ️</button>
              <div style={{ position: "relative" }}>
                <button onClick={() => setHeaderMenu((v) => !v)} title="Chat options" style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}>⋮</button>
                {headerMenu && (
                  <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,.16)", overflow: "hidden", zIndex: 8, minWidth: 160 }}>
                    <button onClick={() => { togglePin(thread.phone); setHeaderMenu(false); }} style={{ ...menuItem, whiteSpace: "nowrap", color: C.plum }}>{pinned.includes(thread.phone) ? "📌 Unpin chat" : "📌 Pin chat"}</button>
                    <button onClick={() => { setInfoOpen(true); setHeaderMenu(false); }} style={{ ...menuItem, whiteSpace: "nowrap", color: C.plum }}>ℹ️ Contact info</button>
                    <button onClick={deleteChat} style={{ ...menuItem, color: "#c0392b", whiteSpace: "nowrap" }}>🗑 Delete chat</button>
                  </div>
                )}
              </div>
            </header>

            {chatSearchOpen && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: C.cream2, borderBottom: `1px solid ${C.border}` }}>
                <input autoFocus value={chatSearch} onChange={(e) => { setChatSearch(e.target.value); setChatSearchIdx(0); }}
                  placeholder="Search in this chat…" style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit" }} />
                <span style={{ fontSize: 12, color: C.sub, minWidth: 42, textAlign: "center" }}>{searchMatches.length ? `${Math.min(chatSearchIdx + 1, searchMatches.length)}/${searchMatches.length}` : (chatSearch ? "0/0" : "")}</span>
                <button onClick={() => setChatSearchIdx((i) => (searchMatches.length ? (i - 1 + searchMatches.length) % searchMatches.length : 0))} disabled={!searchMatches.length} title="Previous" style={{ ...iconBtn, opacity: searchMatches.length ? 1 : 0.4 }}>↑</button>
                <button onClick={() => setChatSearchIdx((i) => (searchMatches.length ? (i + 1) % searchMatches.length : 0))} disabled={!searchMatches.length} title="Next" style={{ ...iconBtn, opacity: searchMatches.length ? 1 : 0.4 }}>↓</button>
                <button onClick={() => { setChatSearchOpen(false); setChatSearch(""); }} title="Close search" style={iconBtn}>×</button>
              </div>
            )}

            {thread.referral && <AdCard referral={thread.referral} />}

            <div ref={scrollRef}
              onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); }}
              onScroll={(e) => { const el = e.currentTarget; setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80); }}
              style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
              {dragOver && (
                <div style={{ position: "absolute", inset: 0, zIndex: 9, background: "rgba(201,166,107,.14)", border: `2px dashed ${C.gold}`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", color: C.plum, fontWeight: 700, fontSize: 16 }}>
                  ⬇ Drop files to send
                </div>
              )}
              {thread.messages.map((m, i) => {
                const out = m.dir === "out";
                const prev = thread.messages[i - 1];
                const showDay = !prev || dayLabel(prev.ts) !== dayLabel(m.ts);
                // An image bubble can come from a public URL (template header
                // photo) or a proxied Meta media id (a sent/received photo).
                const isImage = m.type === "image" && (!!m.mediaId || !!m.imageUrl);
                const isVideo = m.type === "video" && !!m.mediaId;
                const isAudio = m.type === "audio" && !!m.mediaId;
                const isSticker = m.type === "sticker" && !!m.mediaId;
                const isDoc = m.type === "document";
                const isLocation = m.type === "location" && !!m.location;
                // Photo, video and sticker render as edge-to-edge tiles (padding 4).
                const isTile = isImage || isVideo || isSticker;
                const proxy = m.mediaId
                  ? `/api/inbox/media?id=${encodeURIComponent(m.mediaId)}&key=${encodeURIComponent(key)}`
                  : "";
                const imgSrc = m.imageUrl || proxy;
                const placeholder =
                  m.text === "📷 Photo" ||
                  m.text === "🎥 Video" ||
                  m.text === "🎵 Audio" ||
                  m.text === "🌟 Sticker" ||
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
                // Resolve the full quoted message (by id) so a reply to a photo shows
                // a thumbnail — otherwise every photo reply just reads "📷 Photo".
                const qFull = quotedPreview
                  ? thread.messages.find((x) => x.id === (m.quoted?.id || m.quotedId))
                  : null;
                const qThumb =
                  qFull && qFull.type === "image" && (qFull.mediaId || qFull.imageUrl)
                    ? qFull.imageUrl || `/api/inbox/media?id=${encodeURIComponent(qFull.mediaId!)}&key=${encodeURIComponent(key)}`
                    : "";
                return (
                  <div key={m.id} style={{ display: "contents" }}>
                    {showDay && (
                      <div style={{ alignSelf: "center", background: C.cream2, color: C.sub, fontSize: 11, padding: "3px 12px", borderRadius: 10, margin: "6px 0" }}>
                        {dayLabel(m.ts)}
                      </div>
                    )}
                    <div id={`msg-${m.id}`} style={{ alignSelf: out ? "flex-end" : "flex-start", maxWidth: "72%", position: "relative", borderRadius: 13, transition: "box-shadow .3s", boxShadow: highlightId === m.id ? `0 0 0 3px ${C.gold}` : "none", background: chatSearchOpen && searchMatchSet.has(m.id) ? "rgba(201,166,107,.16)" : undefined }}>
                      {msgMenuId === m.id && (
                        <div style={{ position: "absolute", top: 0, [out ? "right" : "left"]: 0, transform: "translateY(-108%)", zIndex: 7, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,.16)", overflow: "hidden" }}>
                          <button onClick={() => { setReplyTo(m); setMsgMenuId(null); }} style={{ ...menuItem, whiteSpace: "nowrap", fontSize: 13, color: C.plum }}>↩ Reply</button>
                          <button onClick={() => { setForwarding(m); setMsgMenuId(null); }} style={{ ...menuItem, whiteSpace: "nowrap", fontSize: 13, color: C.plum }}>↪ Forward</button>
                          <button onClick={() => { toggleStar(m.id); setMsgMenuId(null); }} style={{ ...menuItem, whiteSpace: "nowrap", fontSize: 13, color: C.plum }}>{starred.includes(m.id) ? "⭐ Unstar" : "☆ Star"}</button>
                          {caption && (
                            <button onClick={() => { navigator.clipboard?.writeText(caption).catch(() => {}); setMsgMenuId(null); }} style={{ ...menuItem, whiteSpace: "nowrap", fontSize: 13, color: C.plum }}>📋 Copy</button>
                          )}
                          {(m.mediaId || m.imageUrl) && (
                            <a href={isImage ? imgSrc : proxy} download={m.filename || ""} target="_blank" rel="noreferrer"
                              onClick={() => setMsgMenuId(null)}
                              style={{ ...menuItem, display: "block", whiteSpace: "nowrap", fontSize: 13, color: C.plum, textDecoration: "none" }}>⬇ Download</a>
                          )}
                          <button onClick={() => deleteMsg(m.id)} style={{ ...menuItem, color: "#c0392b", whiteSpace: "nowrap", fontSize: 13 }}>🗑 Delete for me</button>
                        </div>
                      )}
                      <div title={fullStamp(m.ts)} style={{ background: out ? C.outBubble : C.inBubble, border: `1px solid ${C.border}`, borderLeft: m.template ? `3px solid ${C.gold}` : `1px solid ${C.border}`, borderRadius: 12, padding: isTile ? 4 : "8px 11px", fontSize: 14, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {m.template && (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.goldDark, background: "rgba(201,166,107,.16)", border: `1px solid ${C.gold}`, borderRadius: 5, padding: "1px 6px", marginBottom: 5 }}>
                            ✦ Template
                          </div>
                        )}
                        {quotedPreview && (
                          <div onClick={() => jumpToMessage(m.quoted?.id || m.quotedId)} title="Go to message"
                            style={{ display: "flex", gap: 6, alignItems: "stretch", borderLeft: `3px solid ${C.gold}`, background: "rgba(0,0,0,.045)", borderRadius: 6, padding: "3px 8px", marginBottom: 5, maxWidth: "100%", overflow: "hidden", cursor: "pointer" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 10.5, fontWeight: 700, color: C.plum }}>
                                {quotedPreview.dir === "out" ? "You" : (thread.name || "Customer")}
                              </div>
                              <div style={{ fontSize: 12, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {qThumb ? "📷 Photo" : (quotedPreview.text || "Media")}
                              </div>
                            </div>
                            {qThumb && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={qThumb} alt="Photo" style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                            )}
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
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imgSrc} alt={caption || "Photo"} onClick={() => setLightbox(imgSrc)}
                            style={{ maxWidth: "100%", width: 240, maxHeight: 280, objectFit: "cover", borderRadius: 9, display: "block", cursor: "zoom-in" }} />
                        )}
                        {isVideo && proxy && (
                          // eslint-disable-next-line jsx-a11y/media-has-caption
                          <video src={proxy} controls preload="metadata" style={{ maxWidth: "100%", width: 260, maxHeight: 320, borderRadius: 9, display: "block", background: "#000" }} />
                        )}
                        {isSticker && proxy && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={proxy} alt="Sticker" style={{ width: 120, height: 120, objectFit: "contain", display: "block" }} />
                        )}
                        {isAudio && proxy && (
                          // eslint-disable-next-line jsx-a11y/media-has-caption
                          <audio src={proxy} controls preload="metadata" style={{ display: "block", width: 240, maxWidth: "100%" }} />
                        )}
                        {isDoc && (
                          <a href={proxy || "#"} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, color: C.plum, textDecoration: "none", padding: "2px 2px 6px" }}>
                            <span style={{ fontSize: 22 }}>📄</span>
                            <span style={{ fontWeight: 600, wordBreak: "break-all" }}>{m.filename || "Document"}</span>
                          </a>
                        )}
                        <div style={{ padding: isTile ? "4px 7px 2px" : 0 }}>
                          {linkify(caption || (isTile || isAudio || isDoc || isLocation ? "" : m.text))}
                          <span style={{ float: "right", marginLeft: 10, marginTop: 6, fontSize: 10, color: C.sub, display: "inline-flex", gap: 4, alignItems: "center" }}>
                            {starred.includes(m.id) && <span title="Starred" style={{ fontSize: 11 }}>⭐</span>}
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

            {!atBottom && (
              <button onClick={() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); setAtBottom(true); }}
                title="Jump to latest" aria-label="Jump to latest"
                style={{ position: "absolute", right: 24, bottom: 86, zIndex: 8, width: 40, height: 40, borderRadius: "50%", border: `1px solid ${C.border}`, background: "#fff", boxShadow: "0 4px 14px rgba(0,0,0,.18)", cursor: "pointer", fontSize: 18, color: C.plum }}>↓</button>
            )}

            {/* composer */}
            <div style={{ borderTop: `1px solid ${C.border}`, background: "#fff", padding: 12 }}>
              {sendError && <div style={{ color: "#c0392b", fontSize: 12, marginBottom: 8 }}>{sendError}</div>}
              {/* hidden pickers — available whether or not the window is open */}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: "none" }}
                onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) sendAttachments(fs); e.target.value = ""; }} />
              <input ref={videoRef} type="file" accept="video/mp4,video/3gpp" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) sendAttachment(f); e.target.value = ""; }} />
              <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) sendAttachment(f); e.target.value = ""; }} />
              <input ref={audioRef} type="file" accept="audio/mpeg,audio/aac,audio/mp4,audio/ogg,audio/amr,.mp3,.m4a,.aac,.ogg" style={{ display: "none" }}
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
                        <button key={e} onClick={() => setDraft((d) => d + e)} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", width: 34, height: 34, borderRadius: 8 }}>
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                  {attachOpen && (
                    <div style={{ position: "absolute", bottom: "100%", left: 74, marginBottom: 8, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 6px 24px rgba(0,0,0,.12)", padding: 6, zIndex: 5, minWidth: 150 }}>
                      <button onClick={() => { setAttachOpen(false); fileRef.current?.click(); }} style={menuItem}>🖼️ Photos</button>
                      <button onClick={() => { setAttachOpen(false); videoRef.current?.click(); }} style={menuItem}>🎥 Video</button>
                      <button onClick={() => { setAttachOpen(false); audioRef.current?.click(); }} style={menuItem}>🎵 Audio</button>
                      <button onClick={() => { setAttachOpen(false); docRef.current?.click(); }} style={menuItem}>📄 Document</button>
                    </div>
                  )}
                  {quickOpen && (
                    <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 8, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 6px 24px rgba(0,0,0,.12)", padding: 10, zIndex: 5, width: 330, maxHeight: 300, overflowY: "auto" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 12.5, color: C.plum }}>💬 Quick replies</span>
                        <button onClick={() => setQuickEditing((v) => !v)} style={{ border: "none", background: "transparent", color: C.plum, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{quickEditing ? "✓ Done" : "✏️ Edit"}</button>
                      </div>
                      {quickReplies.length === 0 && <div style={{ color: C.sub, fontSize: 12, padding: "4px 2px" }}>No quick replies yet — tap Edit to add.</div>}
                      {quickReplies.map((qr, i) => (
                        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5 }}>
                          {quickEditing ? (
                            <>
                              <textarea value={qr} onChange={(e) => setQuickReplies((list) => list.map((x, j) => (j === i ? e.target.value : x)))} rows={2} style={{ flex: 1, fontSize: 12.5, padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, resize: "vertical", fontFamily: "inherit" }} />
                              <button onClick={() => setQuickReplies((list) => list.filter((_, j) => j !== i))} title="Delete" style={{ border: "none", background: "transparent", color: "#c0392b", fontSize: 15, cursor: "pointer" }}>🗑</button>
                            </>
                          ) : (
                            <button onClick={() => insertQuickReply(qr)} style={{ textAlign: "left", width: "100%", border: `1px solid ${C.border}`, background: C.cream2, borderRadius: 8, padding: "7px 10px", fontSize: 12.5, cursor: "pointer", color: C.text, whiteSpace: "normal", lineHeight: 1.35 }}>{qr}</button>
                          )}
                        </div>
                      ))}
                      {quickEditing && (
                        <button onClick={() => setQuickReplies((list) => [...list, "New quick reply"])} style={{ marginTop: 4, border: `1px dashed ${C.gold}`, background: "transparent", color: C.plum, borderRadius: 8, padding: "6px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", width: "100%" }}>＋ Add quick reply</button>
                      )}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                    <button onClick={openTemplates} title="Send approved template" style={iconBtn}>🗒️</button>
                    <button onClick={() => setQuickOpen((v) => !v)} title="Quick replies" style={iconBtn}>💬</button>
                    <button onClick={() => setEmojiOpen((v) => !v)} title="Emoji" style={iconBtn}>😊</button>
                    <button onClick={() => setAttachOpen((v) => !v)} disabled={uploading} title="Attach photos, video, audio or document" style={{ ...iconBtn, opacity: uploading ? 0.5 : 1 }}>
                      {uploading ? "…" : "📎"}
                    </button>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                      onPaste={(e) => { const fs = Array.from(e.clipboardData?.files || []); if (fs.length) { e.preventDefault(); handleFiles(fs); } }}
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

      {/* contact info drawer */}
      {infoOpen && thread && (
        <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 300, maxWidth: "88%", background: "#fff", borderLeft: `1px solid ${C.border}`, boxShadow: "-6px 0 24px rgba(0,0,0,.12)", zIndex: 9, display: "flex", flexDirection: "column" }}>
          <div style={{ background: HEADER_BG, color: "#fff", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontFamily: SERIF, fontSize: 16 }}>Contact info</span>
            <button onClick={() => setInfoOpen(false)} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
          <div style={{ padding: 18, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: GOLD_BG, color: C.plumDark, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: SERIF, fontSize: 30 }}>{(thread.name || thread.phone).slice(0, 1).toUpperCase()}</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.text, textAlign: "center" }}>{thread.name || "Unnamed contact"}</div>
              <div style={{ fontSize: 13, color: C.sub }}>+{thread.phone}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { navigator.clipboard?.writeText("+" + thread.phone).catch(() => {}); }} style={{ ...btn(C.plum), flex: 1, padding: "9px 0", fontSize: 13 }}>📋 Copy number</button>
              <a href={`https://wa.me/${thread.phone}`} target="_blank" rel="noreferrer" style={{ ...btn(C.gold), flex: 1, padding: "9px 0", fontSize: 13, textAlign: "center", textDecoration: "none", display: "block" }}>Open ↗</a>
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, fontSize: 13, color: C.sub, display: "flex", flexDirection: "column", gap: 8 }}>
              <div><b style={{ color: C.text }}>24-hour window:</b> {windowRemaining(thread.lastInboundTs, nowTick).label}</div>
              <div><b style={{ color: C.text }}>Pinned:</b> {pinned.includes(thread.phone) ? "Yes" : "No"} <button onClick={() => togglePin(thread.phone)} style={{ marginLeft: 6, border: "none", background: "transparent", color: C.plum, cursor: "pointer", fontWeight: 600, fontSize: 12 }}>{pinned.includes(thread.phone) ? "Unpin" : "Pin"}</button></div>
              <div><b style={{ color: C.text }}>Starred messages:</b> {thread.messages.filter((m) => starred.includes(m.id)).length}</div>
            </div>
            {thread.referral && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.plum, marginBottom: 4 }}>📣 Came from an ad</div>
                <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>{thread.referral.headline || thread.referral.body || "Click-to-WhatsApp ad"}</div>
                {thread.referral.sourceUrl && <a href={thread.referral.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.goldDark }}>View ad ↗</a>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* forward picker */}
      {forwarding && (
        <div onClick={() => { setForwarding(null); setForwardSearch(""); }} style={{ position: "fixed", inset: 0, zIndex: 11000, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, color: C.plum, fontSize: 18, fontFamily: SERIF, fontWeight: 600 }}>Forward to…</h3>
              <button onClick={() => { setForwarding(null); setForwardSearch(""); }} style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", color: C.sub }}>×</button>
            </div>
            <div style={{ padding: "8px 14px 6px", fontSize: 12, color: C.sub, borderBottom: `1px solid ${C.border}` }}>
              Forwarding: {forwarding.mediaId ? `🗂 ${forwarding.type || "media"}` : `“${(forwarding.text || "").slice(0, 60)}”`}
            </div>
            <div style={{ padding: 10 }}>
              <input autoFocus value={forwardSearch} onChange={(e) => setForwardSearch(e.target.value)} placeholder="Search name or number" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {convs
                .filter((c) => {
                  const q = forwardSearch.trim().toLowerCase();
                  if (!q) return true;
                  const digits = q.replace(/[^\d]/g, "");
                  return (c.name || "").toLowerCase().includes(q) || !!(digits && c.phone.includes(digits));
                })
                .map((c) => (
                  <button key={c.phone} onClick={() => forwardTo(c.phone)} style={{ width: "100%", textAlign: "left", border: "none", borderBottom: `1px solid ${C.border}`, background: "transparent", padding: "10px 16px", cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: GOLD_BG, color: C.plumDark, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{(c.name || c.phone).slice(0, 1).toUpperCase()}</div>
                    <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name || `+${c.phone}`}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* image lightbox — full-screen viewer with a download button */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, zIndex: 11000, background: "rgba(0,0,0,.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Photo" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "94vw", maxHeight: "86vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 10px 40px rgba(0,0,0,.5)" }} />
          <a href={lightbox} download target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Download"
            style={{ position: "fixed", top: 18, right: 64, background: "rgba(255,255,255,.14)", color: "#fff", borderRadius: 10, padding: "8px 14px", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>⬇ Download</a>
          <button onClick={() => setLightbox(null)} title="Close" style={{ position: "fixed", top: 18, right: 18, background: "rgba(255,255,255,.14)", color: "#fff", border: "none", borderRadius: 10, width: 38, height: 38, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
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
