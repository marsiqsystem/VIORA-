"use client";

// Viora WhatsApp BROADCAST — upload a CSV of customers, pick an approved
// template, map its variables to CSV columns (or static text), and send to
// everyone. Same passcode as the inbox (INBOX_SECRET), stored in localStorage.
//
// The heavy lifting (throttled Cloud API sends + logging) is server-side in
// /api/broadcast; this page parses the CSV, builds each contact's params, and
// drives the send in small batches so it shows live progress.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmailBroadcast from "./EmailBroadcast";

const KEY_STORE = "viora_inbox_key"; // shared with /inbox
type Channel = "whatsapp" | "email";

// Sending speed → client batch size (server caps at 60/req + throttles internally).
const SPEEDS = {
  slow: { label: "Slow", batch: 15, note: "gentle — safest for a fresh number" },
  normal: { label: "Normal", batch: 40, note: "recommended" },
  fast: { label: "Fast", batch: 60, note: "quickest for large, warm lists" },
} as const;
type Speed = keyof typeof SPEEDS;

// Viora brand palette (ruby / champagne gold / cream) — see globals.css.
const C = {
  plum: "#9B1B30", // ruby (primary)
  plumDark: "#5A0A18", // deep ruby
  gold: "#C9A66B", // champagne gold
  goldDark: "#A9844C",
  bg: "#F5F1EA", // cream canvas
  card: "#FFFDF8", // warm card white
  cream2: "#EFE4CE", // secondary cream
  border: "#D8C8B3", // champagne border
  sub: "#7A716C", // muted text
  text: "#1A1410", // ink
  ok: "#1E874B",
  bad: "#C0392B",
};
const HEADER_BG = "linear-gradient(135deg, #1A1410 0%, #5A0A18 100%)";
const GOLD_BG = "linear-gradient(135deg, #C9A66B 0%, #A9844C 100%)";
const SERIF = "var(--font-cormorant), Georgia, 'Times New Roman', serif";

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
type Row = Record<string, string>;
type Mapping = { source: "column" | "static"; column: string; value: string };

// --- tiny CSV parser (handles quotes, commas, CRLF) --------------------------
function parseCSV(text: string): { headers: string[]; rows: Row[] } {
  const cells: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); field = "";
      cells.push(row); row = [];
    } else field += ch;
  }
  if (field.length || row.length) { row.push(field); cells.push(row); }
  const nonEmpty = cells.filter((r) => r.some((c) => c.trim() !== ""));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => {
    const o: Row = {};
    headers.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });
  return { headers, rows };
}

// digits-only E.164-ish, with a default country code for bare 10-digit numbers.
function normalizePhone(raw: string, cc: string): string {
  let d = String(raw || "").replace(/[^\d]/g, "");
  if (!d) return "";
  if (d.length === 10) d = cc + d;
  else if (d.length === 11 && d.startsWith("0")) d = cc + d.slice(1);
  return d;
}
function validPhone(d: string): boolean {
  return d.length >= 11 && d.length <= 15;
}

// Fill {{1}},{{2}}… in a template body for the inbox preview / thread mirror.
function renderBody(bodyText: string, params: string[]): string {
  return String(bodyText || "").replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
}

export default function BroadcastPage() {
  const [key, setKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [authed, setAuthed] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [authError, setAuthError] = useState("");

  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [cc, setCc] = useState("91");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [speed, setSpeed] = useState<Speed>("normal");

  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplError, setTplError] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [mapping, setMapping] = useState<Mapping[]>([]);
  const [headerImageUrl, setHeaderImageUrl] = useState("");
  const [buttonMap, setButtonMap] = useState<Mapping>({ source: "static", column: "", value: "" });

  const [progress, setProgress] = useState<{ running: boolean; done: number; total: number; sent: number; failed: number }>(
    { running: false, done: 0, total: 0, sent: 0, failed: 0 }
  );
  const [failures, setFailures] = useState<{ phone: string; error: string }[]>([]);

  const keyRef = useRef(key);
  keyRef.current = key;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // This page is a position:fixed full-screen overlay ON TOP of the storefront
  // layout (Navbar/Footer + Lenis smooth-scroll on the window). Left alone, the
  // page behind still scrolls, so the browser shows a SECOND, dead scrollbar
  // beside the overlay's own. Lock the background scroll while we're mounted.
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

  const selected = templates.find((t) => t.name === selectedName) || null;

  // --- auth + templates load ---
  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/templates", { headers: { "x-inbox-key": keyRef.current } });
      if (res.status === 503) { setNeedsSetup(true); setAuthed(false); return; }
      if (res.status === 401) { setAuthed(false); setAuthError("Wrong passcode."); return; }
      const data = await res.json();
      if (data.ok) {
        setTemplates(data.templates || []);
        setAuthed(true); setNeedsSetup(false); setTplError("");
        if (!data.templates?.length) setTplError("No APPROVED templates found on this WhatsApp account.");
      } else {
        setAuthed(true);
        setTplError(typeof data.error === "string" ? data.error : "Could not load templates.");
      }
    } catch {
      setTplError("Network error loading templates.");
    }
  }, []);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(KEY_STORE) || "" : "";
    if (saved) { setKey(saved); keyRef.current = saved; }
  }, []);
  useEffect(() => {
    if (key) loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Default the variable mapping whenever the selected template changes.
  useEffect(() => {
    if (!selected) { setMapping([]); return; }
    const nameCol = headers.find((h) => h.toLowerCase() === "name") || "";
    setMapping(
      Array.from({ length: selected.bodyVars }, (_, i) => ({
        source: "column" as const,
        column: i === 0 && nameCol ? nameCol : "",
        value: "",
      }))
    );
    setHeaderImageUrl("");
    setButtonMap({ source: "static", column: "", value: "" });
  }, [selectedName, headers]); // eslint-disable-line react-hooks/exhaustive-deps

  const unlock = () => {
    const k = keyInput.trim();
    if (!k) return;
    window.localStorage.setItem(KEY_STORE, k);
    setKey(k); keyRef.current = k; setAuthError("");
  };

  // Clear the saved passcode from this device (use before handing the phone/
  // laptop to anyone). Also locks the inbox — they share the same stored key.
  const lock = () => {
    window.localStorage.removeItem(KEY_STORE);
    setKey(""); keyRef.current = "";
    setAuthed(false); setTemplates([]); setSelectedName(""); setKeyInput("");
  };

  // Download a ready-to-fill CSV so the user just replaces the sample rows.
  const downloadSample = () => {
    const csv = "name,phone\nZeeshan Shamim,9812345678\nAisha Khan,9123456780\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "viora-broadcast-sample.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    const { headers: h, rows: r } = parseCSV(text);
    setHeaders(h);
    setRows(r);
  };

  // --- derived: normalized + deduped contact list ---
  const contacts = useMemo(() => {
    const phoneCol = headers.find((h) => h.toLowerCase() === "phone" || h.toLowerCase() === "number" || h.toLowerCase() === "mobile");
    const seen = new Set<string>();
    return rows.map((r) => {
      const raw = phoneCol ? r[phoneCol] : "";
      const norm = normalizePhone(raw, cc);
      const valid = validPhone(norm);
      const dup = valid && seen.has(norm);
      if (valid) seen.add(norm);
      return { row: r, raw, norm, valid, dup };
    });
  }, [rows, headers, cc]);

  const sendable = contacts.filter((c) => c.valid && !c.dup);
  const invalidCount = contacts.filter((c) => !c.valid).length;
  const dupCount = contacts.filter((c) => c.dup).length;

  const resolve = (mp: Mapping, row: Row) =>
    mp.source === "static" ? mp.value : (mp.column ? row[mp.column] ?? "" : "");

  const readyToSend =
    !!selected && sendable.length > 0 && !progress.running &&
    (selected.headerFormat !== "IMAGE" || !!headerImageUrl.trim()) &&
    mapping.every((mp) => (mp.source === "static" ? true : !!mp.column));

  const startBroadcast = async () => {
    if (!selected || !readyToSend) return;
    const BATCH_SIZE = SPEEDS[speed].batch; // sending-speed → per-request batch size
    const id = (crypto as any).randomUUID ? crypto.randomUUID() : `bc_${Date.now()}`;
    const total = sendable.length;
    setProgress({ running: true, done: 0, total, sent: 0, failed: 0 });
    setFailures([]);

    const nameCol = headers.find((h) => h.toLowerCase() === "name") || "";
    const payloadContacts = sendable.map(({ row, norm }) => {
      const bodyParams = mapping.map((mp) => resolve(mp, row));
      const buttonParam = selected.hasUrlButton ? resolve(buttonMap, row) : undefined;
      return {
        phone: norm,
        name: nameCol ? row[nameCol] : "",
        bodyParams,
        buttonParam,
        text: renderBody(selected.bodyText, bodyParams),
      };
    });

    let done = 0, sent = 0, failed = 0;
    for (let i = 0; i < payloadContacts.length; i += BATCH_SIZE) {
      const batch = payloadContacts.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch("/api/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-inbox-key": keyRef.current },
          body: JSON.stringify({
            id, total,
            template: {
              name: selected.name,
              languageCode: selected.language,
              headerImageUrl: selected.headerFormat === "IMAGE" ? headerImageUrl.trim() : undefined,
              urlButtonIndex: selected.hasUrlButton ? selected.urlButtonIndex : null,
            },
            contacts: batch,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          sent += data.sent || 0;
          failed += data.failed || 0;
          const fails = (data.results || []).filter((r: any) => !r.ok).map((r: any) => ({ phone: r.phone, error: r.error || "failed" }));
          if (fails.length) setFailures((prev) => [...prev, ...fails]);
        } else {
          failed += batch.length;
          setFailures((prev) => [...prev, { phone: `batch ${i / BATCH_SIZE + 1}`, error: data.error || "batch failed" }]);
        }
      } catch {
        failed += batch.length;
        setFailures((prev) => [...prev, { phone: `batch ${i / BATCH_SIZE + 1}`, error: "network error" }]);
      }
      done += batch.length;
      setProgress({ running: i + BATCH_SIZE < payloadContacts.length, done, total, sent, failed });
    }
    setProgress({ running: false, done, total, sent, failed });
  };

  // --- screens ---
  if (needsSetup) {
    return (
      <Centered>
        <h2 style={{ color: C.plum, margin: "0 0 8px" }}>Broadcast not configured</h2>
        <p style={{ color: C.sub, maxWidth: 440, textAlign: "center" }}>
          Set <code>INBOX_SECRET</code> and <code>WHATSAPP_BUSINESS_ID</code> in Vercel, redeploy,
          then reload and enter the passcode.
        </p>
      </Centered>
    );
  }
  if (!authed) {
    return (
      <Centered>
        <div style={{ width: 330, background: C.card, padding: 30, borderRadius: 18, boxShadow: "0 12px 40px rgba(90,10,24,.14)", border: `1px solid ${C.border}`, borderTop: `3px solid ${C.gold}` }}>
          <h2 style={{ color: C.plum, margin: "0 0 2px", fontSize: 30, fontFamily: SERIF, fontWeight: 600 }}>Viora Broadcast</h2>
          <div style={{ width: 40, height: 2, background: C.gold, margin: "0 0 12px" }} />
          <p style={{ color: C.sub, margin: "0 0 18px", fontSize: 13 }}>Enter the passcode.</p>
          <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && unlock()} placeholder="Passcode"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 15, marginBottom: 12, boxSizing: "border-box" }} />
          {authError && <div style={{ color: C.bad, fontSize: 13, marginBottom: 10 }}>{authError}</div>}
          <button onClick={unlock} style={primaryBtn}>Unlock</button>
        </div>
      </Centered>
    );
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, overflowY: "auto", background: C.bg, color: C.text, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 2, background: HEADER_BG, color: "#fff", padding: "14px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `2px solid ${C.gold}`, gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05, minWidth: 0 }}>
          <span style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, letterSpacing: 0.3 }}>Viora Broadcast</span>
          <span style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: C.gold, marginTop: 3 }}>{channel === "email" ? "Bulk Email Marketing" : "Bulk WhatsApp Marketing"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ display: "none", fontSize: 11, fontWeight: 600, color: C.gold, letterSpacing: 0.5, alignItems: "center", gap: 6 }} className="bc-livepill">
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: templates.length ? "#3ecf6a" : C.sub, display: "inline-block" }} />
            {templates.length ? `${templates.length} template${templates.length === 1 ? "" : "s"} ready` : "Loading…"}
          </span>
          <a href="/inbox" style={{ color: C.gold, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>Inbox →</a>
          <button onClick={lock} title="Log out — you'll need the passcode again next time" style={{ background: "rgba(201,166,107,.16)", color: "#fff", border: `1px solid rgba(201,166,107,.4)`, borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>🔓 Log out</button>
        </div>
        <style>{`@media(min-width:640px){.bc-livepill{display:inline-flex !important}}`}</style>
      </header>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "22px 18px 60px", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Channel switcher: WhatsApp (templates) vs Email (free-form) */}
        <div style={{ display: "flex", gap: 8, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 6, boxShadow: "0 4px 20px rgba(90,10,24,.05)" }}>
          {([
            { id: "whatsapp" as Channel, label: "💬 WhatsApp", note: "Approved templates" },
            { id: "email" as Channel, label: "📧 Email", note: "Free-form, no approval" },
          ]).map((t) => {
            const on = channel === t.id;
            return (
              <button key={t.id} onClick={() => setChannel(t.id)}
                style={{
                  flex: 1, cursor: "pointer", textAlign: "center",
                  border: `1.5px solid ${on ? C.plum : "transparent"}`,
                  background: on ? "rgba(155,27,48,.05)" : "transparent",
                  borderRadius: 9, padding: "10px 8px", transition: "border-color .12s, background .12s",
                }}>
                <div style={{ fontWeight: 700, fontSize: 14.5, color: on ? C.plum : C.text }}>{t.label}</div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{t.note}</div>
              </button>
            );
          })}
        </div>

        {channel === "email" && <EmailBroadcast broadcastKey={key} />}

        {channel === "whatsapp" && (<>
        {/* STEP 1: CSV */}
        <Card step={1} title="Upload customer CSV">
          <p style={{ color: C.sub, fontSize: 13, margin: "0 0 14px" }}>
            CSV with a <b>name</b> and <b>phone</b> column (extra columns can fill template variables).
          </p>

          {/* hidden native picker, driven by the drop zone */}
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />

          {/* drag-&-drop upload zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
            style={{
              border: `2px dashed ${dragOver ? C.plum : C.gold}`,
              background: dragOver ? "rgba(155,27,48,.05)" : "rgba(201,166,107,.07)",
              borderRadius: 14, padding: "28px 20px", textAlign: "center", cursor: "pointer",
              transition: "border-color .15s, background .15s", outline: "none",
            }}
          >
            <div style={{ fontSize: 34, lineHeight: 1, marginBottom: 8, color: C.goldDark }}>⬆</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
              {fileName ? "Replace CSV" : "Click to upload or drag & drop"}
            </div>
            <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4 }}>
              {fileName ? `✓ ${fileName}${rows.length ? ` — ${rows.length} rows` : ""}` : "CSV file · name, phone columns"}
            </div>
          </div>

          {/* controls row: sample + default country code */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <button onClick={downloadSample} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.plum, borderRadius: 10, padding: "8px 14px", fontSize: 13.5, cursor: "pointer", fontWeight: 600 }}>
              ⬇ Download sample CSV
            </button>
            <span style={{ marginLeft: "auto", fontSize: 13, color: C.sub, display: "flex", alignItems: "center", gap: 6 }}>
              Default country code +
              <input value={cc} onChange={(e) => setCc(e.target.value.replace(/[^\d]/g, ""))} style={{ width: 46, padding: "5px 7px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13, background: "#fff" }} />
            </span>
          </div>

          {rows.length > 0 && (
            <>
              <div style={{ display: "flex", gap: 14, margin: "14px 0 8px", fontSize: 13, flexWrap: "wrap" }}>
                <Badge color={C.ok}>{sendable.length} ready</Badge>
                {dupCount > 0 && <Badge color={C.sub}>{dupCount} duplicate</Badge>}
                {invalidCount > 0 && <Badge color={C.bad}>{invalidCount} invalid</Badge>}
              </div>
              <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 240, overflowY: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={th}>#</th>
                      {headers.map((h) => <th key={h} style={th}>{h}</th>)}
                      <th style={th}>→ send to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.slice(0, 100).map((c, i) => (
                      <tr key={i} style={{ background: !c.valid ? "#FBEBE8" : c.dup ? "#F3EEE3" : "transparent" }}>
                        <td style={td}>{i + 1}</td>
                        {headers.map((h) => <td key={h} style={td}>{c.row[h]}</td>)}
                        <td style={{ ...td, color: !c.valid ? C.bad : c.dup ? C.sub : C.ok, whiteSpace: "nowrap" }}>
                          {!c.valid ? "invalid" : c.dup ? "duplicate" : `+${c.norm}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {contacts.length > 100 && <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>Showing first 100 of {contacts.length} rows.</div>}
            </>
          )}
        </Card>

        {/* STEP 2: template */}
        <Card step={2} title="Pick an approved template">
          {tplError && <div style={{ color: C.bad, fontSize: 13, marginBottom: 10 }}>{tplError}</div>}
          {templates.length === 0 && !tplError && (
            <div style={{ color: C.sub, fontSize: 13, padding: "8px 0" }}>Loading approved templates…</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
            {templates.map((t) => {
              const on = t.name === selectedName;
              return (
                <button
                  key={`${t.name}:${t.language}`}
                  onClick={() => setSelectedName(on ? "" : t.name)}
                  style={{
                    textAlign: "left", cursor: "pointer",
                    border: `1.5px solid ${on ? C.plum : C.border}`,
                    background: on ? "rgba(155,27,48,.04)" : C.card,
                    borderRadius: 12, padding: "12px 13px",
                    boxShadow: on ? `0 4px 14px rgba(90,10,24,.1)` : "none",
                    position: "relative", transition: "border-color .12s, box-shadow .12s",
                  }}
                >
                  {on && (
                    <span style={{ position: "absolute", top: 10, right: 10, width: 18, height: 18, borderRadius: "50%", background: C.plum, color: "#fff", fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✓</span>
                  )}
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: C.text, paddingRight: 22, wordBreak: "break-word" }}>{t.name}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 8px" }}>
                    <span style={pill(C.gold)}>{t.language}</span>
                    {t.category && <span style={pill(C.sub)}>{t.category}</span>}
                    {t.headerFormat === "IMAGE" && <span style={pill(C.sub)}>🖼 image</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.45, maxHeight: 54, overflow: "hidden", whiteSpace: "pre-wrap" }}>
                    {t.bodyText || "(no body text)"}
                  </div>
                  {t.bodyVars > 0 && (
                    <div style={{ fontSize: 11, color: C.goldDark, marginTop: 8, fontWeight: 600 }}>
                      {t.bodyVars} variable{t.bodyVars === 1 ? "" : "s"} to fill
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {selected && (
            <div style={{ marginTop: 14 }}>
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, whiteSpace: "pre-wrap", color: C.text }}>
                {selected.bodyText || <span style={{ color: C.sub }}>(no body text)</span>}
              </div>

              {selected.headerFormat === "IMAGE" && (
                <div style={{ marginTop: 12 }}>
                  <label style={label}>Header image URL (required for this template)</label>
                  <input value={headerImageUrl} onChange={(e) => setHeaderImageUrl(e.target.value)} placeholder="https://…/image.jpg"
                    style={inputStyle} />
                </div>
              )}
              {selected.headerVars > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: C.bad }}>
                  ⚠ This template has header text variables, which this composer doesn’t map yet — pick a template whose variables are all in the body, or tell me to add header-variable support.
                </div>
              )}

              {mapping.map((mp, i) => (
                <div key={i} style={{ marginTop: 12 }}>
                  <label style={label}>Body variable {`{{${i + 1}}}`}</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <select value={mp.source} onChange={(e) => setMapping((m) => m.map((x, j) => j === i ? { ...x, source: e.target.value as any } : x))}
                      style={{ ...inputStyle, width: 130 }}>
                      <option value="column">CSV column</option>
                      <option value="static">Static text</option>
                    </select>
                    {mp.source === "column" ? (
                      <select value={mp.column} onChange={(e) => setMapping((m) => m.map((x, j) => j === i ? { ...x, column: e.target.value } : x))} style={{ ...inputStyle, flex: 1, minWidth: 160 }}>
                        <option value="">— choose column —</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    ) : (
                      <input value={mp.value} onChange={(e) => setMapping((m) => m.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} placeholder="Same text for everyone" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
                    )}
                  </div>
                </div>
              ))}

              {selected.hasUrlButton && (
                <div style={{ marginTop: 12 }}>
                  <label style={label}>Button link suffix (fills the template’s URL button)</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <select value={buttonMap.source} onChange={(e) => setButtonMap((b) => ({ ...b, source: e.target.value as any }))} style={{ ...inputStyle, width: 130 }}>
                      <option value="static">Static text</option>
                      <option value="column">CSV column</option>
                    </select>
                    {buttonMap.source === "column" ? (
                      <select value={buttonMap.column} onChange={(e) => setButtonMap((b) => ({ ...b, column: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 160 }}>
                        <option value="">— choose column —</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    ) : (
                      <input value={buttonMap.value} onChange={(e) => setButtonMap((b) => ({ ...b, value: e.target.value }))} placeholder="e.g. a slug or code" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* STEP 3: send */}
        <Card step={3} title="Review & send">
          {/* sending speed */}
          <div style={{ marginBottom: 16 }}>
            <div style={label}>Sending speed</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(Object.keys(SPEEDS) as Speed[]).map((s) => {
                const on = speed === s;
                const cfg = SPEEDS[s];
                return (
                  <button key={s} onClick={() => setSpeed(s)}
                    style={{
                      flex: "1 1 150px", textAlign: "left", cursor: "pointer",
                      border: `1.5px solid ${on ? C.plum : C.border}`,
                      background: on ? "rgba(155,27,48,.04)" : C.card,
                      borderRadius: 10, padding: "10px 12px",
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: on ? C.plum : C.text }}>{cfg.label}</span>
                      <span style={{ fontSize: 10.5, color: C.sub }}>{cfg.batch}/batch</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>{cfg.note}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <button onClick={startBroadcast} disabled={!readyToSend}
              style={{ ...primaryBtn, width: "auto", padding: "12px 26px", opacity: readyToSend ? 1 : 0.5, cursor: readyToSend ? "pointer" : "not-allowed" }}>
              {progress.running ? "Sending…" : `Send to ${sendable.length} customer${sendable.length === 1 ? "" : "s"}`}
            </button>
            {!selected && <span style={{ fontSize: 13, color: C.sub }}>Pick a template first.</span>}
            {selected && sendable.length === 0 && <span style={{ fontSize: 13, color: C.sub }}>Upload a CSV with valid numbers.</span>}
          </div>

          {(progress.running || progress.done > 0) && (
            <div style={{ marginTop: 16 }}>
              <div style={{ height: 12, background: C.cream2, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: GOLD_BG, transition: "width .3s" }} />
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 13 }}>
                <span>{progress.done}/{progress.total} processed</span>
                <span style={{ color: C.ok }}>✓ {progress.sent} sent</span>
                {progress.failed > 0 && <span style={{ color: C.bad }}>✗ {progress.failed} failed</span>}
                {!progress.running && progress.done > 0 && <span style={{ marginLeft: "auto", fontWeight: 600 }}>Done.</span>}
              </div>
              {failures.length > 0 && (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: "pointer", fontSize: 13, color: C.bad }}>{failures.length} failures</summary>
                  <div style={{ maxHeight: 160, overflowY: "auto", marginTop: 6, fontSize: 12, color: C.sub }}>
                    {failures.map((f, i) => <div key={i}>+{f.phone} — {f.error}</div>)}
                  </div>
                </details>
              )}
            </div>
          )}
          <p style={{ fontSize: 12, color: C.sub, marginTop: 14, lineHeight: 1.5 }}>
            Broadcasts use approved templates, so they reach customers even outside the 24-hour window.
            Each message also appears in that customer’s <a href="/inbox" style={{ color: C.plum }}>Inbox</a> thread.
          </p>
        </Card>
        </>)}
      </div>
    </div>
  );
}

// --- small presentational helpers -------------------------------------------
function Card({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, boxShadow: "0 4px 20px rgba(90,10,24,.05)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ width: 30, height: 30, borderRadius: "50%", background: GOLD_BG, color: C.plumDark, fontWeight: 700, fontSize: 15, fontFamily: SERIF, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 6px rgba(169,132,76,.35)" }}>{step}</span>
        <h3 style={{ margin: 0, color: C.text, fontSize: 21, fontFamily: SERIF, fontWeight: 600, letterSpacing: 0.2 }}>{title}</h3>
      </div>
      {children}
    </section>
  );
}
function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ color, fontWeight: 600 }}>{children}</span>;
}
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, background: C.bg, fontFamily: "system-ui, sans-serif", padding: 20 }}>
      {children}
    </div>
  );
}
const primaryBtn: React.CSSProperties = { width: "100%", background: C.plum, color: "#fff", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 15, fontWeight: 600, cursor: "pointer" };
const pill = (color: string): React.CSSProperties => ({
  fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
  color, border: `1px solid ${color}`, background: "transparent",
  borderRadius: 5, padding: "1px 6px", lineHeight: 1.6,
});
const inputStyle: React.CSSProperties = { padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box", background: "#fff" };
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 5 };
const th: React.CSSProperties = { position: "sticky", top: 0, background: "#F3EEE3", textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", fontWeight: 600, color: "#1A1410" };
const td: React.CSSProperties = { padding: "7px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" };
