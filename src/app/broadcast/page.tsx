"use client";

// Viora WhatsApp BROADCAST — upload a CSV of customers, pick an approved
// template, map its variables to CSV columns (or static text), and send to
// everyone. Same passcode as the inbox (INBOX_SECRET), stored in localStorage.
//
// The heavy lifting (throttled Cloud API sends + logging) is server-side in
// /api/broadcast; this page parses the CSV, builds each contact's params, and
// drives the send in small batches so it shows live progress.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const KEY_STORE = "viora_inbox_key"; // shared with /inbox
const BATCH_SIZE = 40;

const C = {
  plum: "#7b1e3b",
  plumDark: "#5c132b",
  bg: "#f4eef0",
  card: "#ffffff",
  border: "#e7dce0",
  sub: "#8a7c81",
  text: "#2a2126",
  ok: "#1e874b",
  bad: "#c0392b",
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

  const [cc, setCc] = useState("91");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);

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
        <div style={{ width: 320, background: "#fff", padding: 28, borderRadius: 16, boxShadow: "0 8px 30px rgba(0,0,0,.08)", border: `1px solid ${C.border}` }}>
          <h2 style={{ color: C.plum, margin: "0 0 4px", fontSize: 22 }}>Viora Broadcast</h2>
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
      <header style={{ position: "sticky", top: 0, zIndex: 2, background: C.plum, color: "#fff", padding: "16px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 18 }}>Viora Broadcast</strong>
        <a href="/inbox" style={{ color: "#fff", fontSize: 13, opacity: 0.9 }}>Go to Inbox →</a>
      </header>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "22px 18px 60px", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* STEP 1: CSV */}
        <Card title="1 · Upload customer CSV">
          <p style={{ color: C.sub, fontSize: 13, margin: "0 0 12px" }}>
            CSV with a <b>name</b> and <b>phone</b> column (extra columns can fill template variables).
          </p>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ ...primaryBtn, width: "auto", padding: "9px 16px", cursor: "pointer", display: "inline-block" }}>
              Choose CSV
              <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            </label>
            {fileName && <span style={{ fontSize: 13, color: C.sub }}>{fileName}</span>}
            <span style={{ marginLeft: "auto", fontSize: 13, color: C.sub, display: "flex", alignItems: "center", gap: 6 }}>
              Default country code +
              <input value={cc} onChange={(e) => setCc(e.target.value.replace(/[^\d]/g, ""))} style={{ width: 46, padding: "5px 7px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 13 }} />
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
                      <tr key={i} style={{ background: !c.valid ? "#fdecea" : c.dup ? "#f6f2f3" : "transparent" }}>
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
        <Card title="2 · Pick an approved template">
          {tplError && <div style={{ color: C.bad, fontSize: 13, marginBottom: 10 }}>{tplError}</div>}
          <select value={selectedName} onChange={(e) => setSelectedName(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, background: "#fff" }}>
            <option value="">— Select a template —</option>
            {templates.map((t) => (
              <option key={`${t.name}:${t.language}`} value={t.name}>{t.name} ({t.language}) · {t.category}</option>
            ))}
          </select>

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
        <Card title="3 · Send">
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
              <div style={{ height: 12, background: "#eadfe4", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: C.plum, transition: "width .3s" }} />
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
      </div>
    </div>
  );
}

// --- small presentational helpers -------------------------------------------
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,.03)" }}>
      <h3 style={{ margin: "0 0 12px", color: C.plum, fontSize: 15 }}>{title}</h3>
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
const inputStyle: React.CSSProperties = { padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box", background: "#fff" };
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 5 };
const th: React.CSSProperties = { position: "sticky", top: 0, background: "#f6f2f3", textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", fontWeight: 600 };
const td: React.CSSProperties = { padding: "7px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" };
