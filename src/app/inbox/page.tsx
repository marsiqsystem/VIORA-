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
};
type Thread = {
  phone: string;
  name: string;
  withinWindow: boolean;
  messages: Message[];
};

// --- colours (single, light dashboard look) ---------------------------------
const C = {
  plum: "#7b1e3b",
  plumDark: "#5c132b",
  bgList: "#ffffff",
  bgChat: "#f4eef0",
  inBubble: "#ffffff",
  outBubble: "#f3dfe6",
  border: "#e7dce0",
  sub: "#8a7c81",
  text: "#2a2126",
};

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
function Ticks({ status }: { status?: string }) {
  if (!status) return null;
  if (status === "pending") return <span title="pending" style={{ color: C.sub }}>🕓</span>;
  if (status === "failed") return <span title="failed" style={{ color: "#c0392b" }}>✗</span>;
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
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [composing, setComposing] = useState(false);
  const [newPhone, setNewPhone] = useState("");

  const keyRef = useRef(key);
  const activeRef = useRef(active);
  keyRef.current = key;
  activeRef.current = active;
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
      setThread({ phone, name: conv?.name || phone, withinWindow: conv?.withinWindow ?? true, messages: MOCK_THREADS[phone] || [] });
      return;
    }
    try {
      const res = await api(`/api/inbox/conversations?phone=${encodeURIComponent(phone)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) setThread({ phone: data.phone, name: data.name, withinWindow: data.withinWindow, messages: data.messages || [] });
    } catch { /* ignore */ }
  }, [api]);

  // --- open a conversation ---
  const openConv = useCallback(async (phone: string) => {
    setActive(phone);
    setSendError("");
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
    // optimistic
    const optimistic: Message = { id: `tmp_${Date.now()}`, dir: "out", text, ts: Date.now(), status: "pending" };
    setThread((t) => (t ? { ...t, messages: [...t.messages, optimistic] } : t));
    setDraft("");
    if (MOCK) { setSending(false); return; }
    try {
      const res = await api("/api/inbox/send", { method: "POST", body: JSON.stringify({ to: phone, text }) });
      const data = await res.json();
      if (!data.ok) setSendError(typeof data.error === "string" ? data.error : "Send failed.");
      await loadThread(phone);
      loadConvs();
    } catch {
      setSendError("Network error while sending.");
    } finally {
      setSending(false);
    }
  }, [draft, sending, api, loadThread, loadConvs]);

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
        <div style={{ width: 320, background: "#fff", padding: 28, borderRadius: 16, boxShadow: "0 8px 30px rgba(0,0,0,.08)", border: `1px solid ${C.border}` }}>
          <h2 style={{ color: C.plum, margin: "0 0 4px", fontSize: 22 }}>Viora Inbox</h2>
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

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", height: "100dvh", background: C.bgChat, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: C.text }}>
      {/* LEFT: conversation list */}
      <aside style={{ width: 340, minWidth: 300, borderRight: `1px solid ${C.border}`, background: C.bgList, display: "flex", flexDirection: "column", }}>
        <header style={{ background: C.plum, color: "#fff", padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <strong style={{ fontSize: 17, letterSpacing: 0.3 }}>Viora Inbox</strong>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11, opacity: 0.85 }}>{MOCK ? "MOCK" : "live"}</span>
            <button
              onClick={() => setComposing((v) => !v)}
              title="New chat"
              style={{ background: "rgba(255,255,255,.18)", color: "#fff", border: "none", borderRadius: "50%", width: 30, height: 30, fontSize: 20, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {composing ? "×" : "+"}
            </button>
          </div>
        </header>

        {composing && (
          <div style={{ padding: 14, borderBottom: `1px solid ${C.border}`, background: "#faf3f5" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: C.plum }}>New chat</div>
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
          {convs.map((c) => {
            const isActive = c.phone === active;
            return (
              <button
                key={c.phone}
                onClick={() => openConv(c.phone)}
                style={{
                  width: "100%", textAlign: "left", border: "none", cursor: "pointer",
                  background: isActive ? "#faf3f5" : "transparent",
                  padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
                  display: "flex", gap: 12, alignItems: "center",
                }}
              >
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: C.plum, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, flexShrink: 0 }}>
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
          })}
        </div>
      </aside>

      {/* RIGHT: thread */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {!thread ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 40 }}>💬</div>
            <div>Select a conversation to start replying.</div>
          </div>
        ) : (
          <>
            <header style={{ background: C.plum, color: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.plumDark, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>
                {(thread.name || thread.phone).slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{thread.name || `+${thread.phone}`}</div>
                <div style={{ fontSize: 11, opacity: 0.85 }}>+{thread.phone}</div>
              </div>
            </header>

            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 8 }}>
              {thread.messages.map((m) => {
                const out = m.dir === "out";
                return (
                  <div key={m.id} style={{ alignSelf: out ? "flex-end" : "flex-start", maxWidth: "72%" }}>
                    <div style={{ background: out ? C.outBubble : C.inBubble, border: `1px solid ${C.border}`, borderRadius: 12, padding: "8px 11px", fontSize: 14, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {m.text}
                      <span style={{ float: "right", marginLeft: 10, marginTop: 6, fontSize: 10, color: C.sub, display: "inline-flex", gap: 4, alignItems: "center" }}>
                        {clock(m.ts)} {out && <Ticks status={m.status} />}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* composer */}
            <div style={{ borderTop: `1px solid ${C.border}`, background: "#fff", padding: 12 }}>
              {sendError && <div style={{ color: "#c0392b", fontSize: 12, marginBottom: 8 }}>{sendError}</div>}
              {!canType ? (
                <div style={{ color: C.sub, fontSize: 13, textAlign: "center", padding: "8px 4px" }}>
                  ⏳ 24-hour reply window closed for this customer. WhatsApp only allows an approved
                  <b> template</b> now (e.g. order / delivery messages fire automatically).
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder="Type a reply…  (Enter to send, Shift+Enter for newline)"
                    rows={1}
                    style={{ flex: 1, resize: "none", maxHeight: 120, padding: "10px 12px", borderRadius: 20, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }}
                  />
                  <button onClick={send} disabled={sending || !draft.trim()} style={{ ...btn(C.plum), width: "auto", padding: "10px 20px", opacity: sending || !draft.trim() ? 0.5 : 1 }}>
                    {sending ? "…" : "Send"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, background: "#f4eef0", fontFamily: "system-ui, sans-serif", padding: 20 }}>
      {children}
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return { width: "100%", background: bg, color: "#fff", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 15, fontWeight: 600, cursor: "pointer" };
}
