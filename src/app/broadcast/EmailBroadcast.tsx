"use client";

// Viora EMAIL BROADCAST — the email twin of the WhatsApp broadcast tab.
//
// No template approval: the admin types a subject + message + footer, uploads a
// hero image, drops a CSV of (name, email), and we blast a Viora-branded email
// from mail@viorajewel.in. Personalise the body with {name}. The heavy lifting
// (branded HTML + throttled SMTP sends) is server-side in /api/broadcast-email;
// this component parses the CSV, batches, and shows live progress.

import { useMemo, useRef, useState } from "react";

// Viora brand palette — kept in sync with the WhatsApp broadcast page.
const C = {
  plum: "#9B1B30",
  plumDark: "#5A0A18",
  gold: "#C9A66B",
  goldDark: "#A9844C",
  bg: "#F5F1EA",
  card: "#FFFDF8",
  cream2: "#EFE4CE",
  border: "#D8C8B3",
  sub: "#7A716C",
  text: "#1A1410",
  ok: "#1E874B",
  bad: "#C0392B",
};
const GOLD_BG = "linear-gradient(135deg, #C9A66B 0%, #A9844C 100%)";
const SERIF = "var(--font-cormorant), Georgia, 'Times New Roman', serif";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB — keep the per-batch payload sane

type Row = Record<string, string>;

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

const firstName = (n: string) => String(n || "").trim().split(/\s+/)[0] || "there";
const previewText = (text: string, name: string) =>
  String(text || "").replace(/\{\{?\s*name\s*\}?\}/gi, firstName(name));

export default function EmailBroadcast({ broadcastKey }: { broadcastKey: string }) {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [footer, setFooter] = useState("");
  const [buttonLabel, setButtonLabel] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageError, setImageError] = useState("");

  const [progress, setProgress] = useState({ running: false, done: 0, total: 0, sent: 0, failed: 0 });
  const [failures, setFailures] = useState<{ email: string; error: string }[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imgInputRef = useRef<HTMLInputElement | null>(null);

  const onFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    const { headers: h, rows: r } = parseCSV(text);
    setHeaders(h);
    setRows(r);
  };

  const onImage = (file: File) => {
    setImageError("");
    if (!file.type.startsWith("image/")) { setImageError("Please choose an image file."); return; }
    if (file.size > MAX_IMAGE_BYTES) { setImageError("Image is too large (max 3 MB). Compress it and retry."); return; }
    const reader = new FileReader();
    reader.onload = () => { setImageDataUrl(String(reader.result || "")); setImageName(file.name); };
    reader.readAsDataURL(file);
  };

  const downloadSample = () => {
    const csv = "name,email\nAisha Khan,aisha@example.com\nZeeshan Shamim,zeeshan@example.com\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "viora-email-broadcast-sample.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  // Resolve name/email columns (case-insensitive) and dedupe by email.
  const contacts = useMemo(() => {
    const emailCol = headers.find((h) => h.toLowerCase() === "email" || h.toLowerCase() === "e-mail" || h.toLowerCase() === "mail");
    const nameCol = headers.find((h) => h.toLowerCase() === "name" || h.toLowerCase() === "full name" || h.toLowerCase() === "first name");
    const seen = new Set<string>();
    return rows.map((r) => {
      const email = (emailCol ? r[emailCol] : "").trim().toLowerCase();
      const name = nameCol ? r[nameCol] : "";
      const valid = EMAIL_RE.test(email);
      const dup = valid && seen.has(email);
      if (valid) seen.add(email);
      return { row: r, email, name, valid, dup };
    });
  }, [rows, headers]);

  const sendable = contacts.filter((c) => c.valid && !c.dup);
  const invalidCount = contacts.filter((c) => !c.valid).length;
  const dupCount = contacts.filter((c) => c.dup).length;

  const readyToSend = !!subject.trim() && !!message.trim() && sendable.length > 0 && !progress.running;

  const startBroadcast = async () => {
    if (!readyToSend) return;
    const BATCH_SIZE = 20; // server caps at 25/req
    const total = sendable.length;
    setProgress({ running: true, done: 0, total, sent: 0, failed: 0 });
    setFailures([]);

    const payload = sendable.map((c) => ({ name: c.name, email: c.email }));
    let done = 0, sent = 0, failed = 0;

    for (let i = 0; i < payload.length; i += BATCH_SIZE) {
      const batch = payload.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch("/api/broadcast-email", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-inbox-key": broadcastKey },
          body: JSON.stringify({
            subject: subject.trim(),
            message,
            footer: footer.trim(),
            buttonLabel: buttonLabel.trim(),
            buttonUrl: buttonUrl.trim(),
            image: imageDataUrl ? { dataUrl: imageDataUrl } : undefined,
            contacts: batch,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          sent += data.sent || 0;
          failed += data.failed || 0;
          const fails = (data.results || []).filter((r: any) => !r.ok).map((r: any) => ({ email: r.email, error: r.error || "failed" }));
          if (fails.length) setFailures((prev) => [...prev, ...fails]);
        } else {
          failed += batch.length;
          setFailures((prev) => [...prev, { email: `batch ${i / BATCH_SIZE + 1}`, error: data.error || "batch failed" }]);
        }
      } catch {
        failed += batch.length;
        setFailures((prev) => [...prev, { email: `batch ${i / BATCH_SIZE + 1}`, error: "network error" }]);
      }
      done += batch.length;
      setProgress({ running: i + BATCH_SIZE < payload.length, done, total, sent, failed });
    }
    setProgress({ running: false, done, total, sent, failed });
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const sampleName = sendable[0]?.name || "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* STEP 1: CSV */}
      <Card step={1} title="Upload customer CSV">
        <p style={{ color: C.sub, fontSize: 13, margin: "0 0 14px" }}>
          CSV with a <b>name</b> and <b>email</b> column. Duplicate and invalid emails are skipped automatically.
        </p>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        <div
          role="button" tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
          style={{
            border: `2px dashed ${dragOver ? C.plum : C.gold}`,
            background: dragOver ? "rgba(155,27,48,.05)" : "rgba(201,166,107,.07)",
            borderRadius: 14, padding: "28px 20px", textAlign: "center", cursor: "pointer", outline: "none",
          }}
        >
          <div style={{ fontSize: 34, lineHeight: 1, marginBottom: 8, color: C.goldDark }}>⬆</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{fileName ? "Replace CSV" : "Click to upload or drag & drop"}</div>
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4 }}>
            {fileName ? `✓ ${fileName}${rows.length ? ` — ${rows.length} rows` : ""}` : "CSV file · name, email columns"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <button onClick={downloadSample} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.plum, borderRadius: 10, padding: "8px 14px", fontSize: 13.5, cursor: "pointer", fontWeight: 600 }}>
            ⬇ Download sample CSV
          </button>
        </div>

        {rows.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 14, margin: "14px 0 8px", fontSize: 13, flexWrap: "wrap" }}>
              <span style={{ color: C.ok, fontWeight: 600 }}>{sendable.length} ready</span>
              {dupCount > 0 && <span style={{ color: C.sub, fontWeight: 600 }}>{dupCount} duplicate</span>}
              {invalidCount > 0 && <span style={{ color: C.bad, fontWeight: 600 }}>{invalidCount} invalid</span>}
            </div>
            <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 240, overflowY: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                  <tr><th style={th}>#</th>{headers.map((h) => <th key={h} style={th}>{h}</th>)}<th style={th}>→ send to</th></tr>
                </thead>
                <tbody>
                  {contacts.slice(0, 100).map((c, i) => (
                    <tr key={i} style={{ background: !c.valid ? "#FBEBE8" : c.dup ? "#F3EEE3" : "transparent" }}>
                      <td style={td}>{i + 1}</td>
                      {headers.map((h) => <td key={h} style={td}>{c.row[h]}</td>)}
                      <td style={{ ...td, color: !c.valid ? C.bad : c.dup ? C.sub : C.ok, whiteSpace: "nowrap" }}>
                        {!c.valid ? "invalid" : c.dup ? "duplicate" : c.email}
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

      {/* STEP 2: compose */}
      <Card step={2} title="Compose the email">
        <label style={label}>Subject line</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. New arrivals just dropped ✨" style={{ ...inputStyle, width: "100%", marginBottom: 14 }} />

        <label style={label}>Hero image (optional)</label>
        <input ref={imgInputRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onImage(f); e.target.value = ""; }} />
        {imageDataUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6, flexWrap: "wrap" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageDataUrl} alt="hero preview" style={{ width: 140, height: "auto", borderRadius: 10, border: `1px solid ${C.border}` }} />
            <div style={{ fontSize: 13, color: C.sub }}>
              <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>{imageName}</div>
              <button onClick={() => imgInputRef.current?.click()} style={secondaryBtn}>Replace</button>
              <button onClick={() => { setImageDataUrl(""); setImageName(""); }} style={{ ...secondaryBtn, marginLeft: 8, color: C.bad, borderColor: C.bad }}>Remove</button>
            </div>
          </div>
        ) : (
          <button onClick={() => imgInputRef.current?.click()} style={{ ...secondaryBtn, marginBottom: 6 }}>🖼 Upload image</button>
        )}
        {imageError && <div style={{ color: C.bad, fontSize: 12.5, marginBottom: 6 }}>{imageError}</div>}
        <div style={{ height: 8 }} />

        <label style={label}>Message body</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8}
          placeholder={"Hi {name},\n\nWrite your message here. Leave a blank line between paragraphs.\n\nWith love,\nTeam Viora"}
          style={{ ...inputStyle, width: "100%", resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }} />
        <div style={{ fontSize: 12, color: C.sub, margin: "6px 0 14px" }}>
          Tip: type <code style={code}>{"{name}"}</code> anywhere to insert the customer&apos;s first name.
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={label}>Button text (optional)</label>
            <input value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} placeholder="SHOP NOW" style={{ ...inputStyle, width: "100%" }} />
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label style={label}>Button link (optional)</label>
            <input value={buttonUrl} onChange={(e) => setButtonUrl(e.target.value)} placeholder="https://viorajewel.in/products" style={{ ...inputStyle, width: "100%" }} />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={label}>Footer line (optional)</label>
          <input value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="e.g. Use code VIORA10 for 10% off this week." style={{ ...inputStyle, width: "100%" }} />
        </div>
      </Card>

      {/* STEP 3: preview + send */}
      <Card step={3} title="Preview & send">
        {(subject || message || imageDataUrl) && (
          <div style={{ marginBottom: 18 }}>
            <div style={label}>Preview {sampleName ? `(as ${firstName(sampleName)})` : ""}</div>
            <div style={{ background: "#f4efec", borderRadius: 12, padding: 16 }}>
              <div style={{ maxWidth: 460, margin: "0 auto", background: "#fff", border: `4px solid ${C.plum}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ textAlign: "center", padding: "16px 16px 6px", fontFamily: SERIF, fontSize: 26, letterSpacing: 3, color: C.plum }}>VIORA</div>
                <div style={{ width: 50, height: 2, background: C.goldDark, margin: "0 auto 6px" }} />
                {imageDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageDataUrl} alt="hero" style={{ display: "block", width: "100%", padding: "10px 14px 0", boxSizing: "border-box" }} />
                )}
                <div style={{ padding: "16px 24px", fontFamily: "Georgia, serif", fontSize: 14, lineHeight: 1.7, color: C.text, whiteSpace: "pre-wrap" }}>
                  {previewText(message, sampleName) || <span style={{ color: C.sub }}>Your message will appear here…</span>}
                </div>
                {buttonLabel.trim() && buttonUrl.trim() && (
                  <div style={{ textAlign: "center", margin: "6px 0 22px" }}>
                    <span style={{ display: "inline-block", background: C.plum, color: "#fff", padding: "12px 38px", borderRadius: 999, fontWeight: 700, fontSize: 13 }}>{buttonLabel}</span>
                  </div>
                )}
                <div style={{ background: "#f4eeeb", padding: "16px", textAlign: "center", fontSize: 11.5, color: C.sub, borderTop: "1px solid #ecdfd9" }}>
                  {footer.trim() && <div style={{ color: C.text, marginBottom: 8 }}>{previewText(footer, sampleName)}</div>}
                  <div>38C B.T. Road, Kolkata - 700 056, India.</div>
                  <div style={{ marginTop: 8, fontSize: 16 }}>📘 📷 🌐</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <button onClick={startBroadcast} disabled={!readyToSend}
            style={{ ...primaryBtn, width: "auto", padding: "12px 26px", opacity: readyToSend ? 1 : 0.5, cursor: readyToSend ? "pointer" : "not-allowed" }}>
            {progress.running ? "Sending…" : `Send to ${sendable.length} customer${sendable.length === 1 ? "" : "s"}`}
          </button>
          {!subject.trim() && <span style={{ fontSize: 13, color: C.sub }}>Add a subject.</span>}
          {subject.trim() && !message.trim() && <span style={{ fontSize: 13, color: C.sub }}>Write a message.</span>}
          {subject.trim() && message.trim() && sendable.length === 0 && <span style={{ fontSize: 13, color: C.sub }}>Upload a CSV with valid emails.</span>}
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
                  {failures.map((f, i) => <div key={i}>{f.email} — {f.error}</div>)}
                </div>
              </details>
            )}
          </div>
        )}
        <p style={{ fontSize: 12, color: C.sub, marginTop: 14, lineHeight: 1.5 }}>
          Emails are sent from <b>mail@viorajewel.in</b>. Sends are throttled so your mailbox isn&apos;t flagged — a large list may take a minute or two.
        </p>
      </Card>
    </div>
  );
}

// --- small presentational helpers (mirrors the WhatsApp broadcast page) ------
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

const primaryBtn: React.CSSProperties = { width: "100%", background: C.plum, color: "#fff", border: "none", borderRadius: 10, padding: "11px 0", fontSize: 15, fontWeight: 600, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { background: "transparent", border: `1px solid ${C.border}`, color: C.plum, borderRadius: 9, padding: "7px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 };
const inputStyle: React.CSSProperties = { padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box", background: "#fff" };
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 5 };
const code: React.CSSProperties = { background: "#F3EEE3", padding: "1px 5px", borderRadius: 4, fontSize: 12 };
const th: React.CSSProperties = { position: "sticky", top: 0, background: "#F3EEE3", textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", fontWeight: 600, color: "#1A1410" };
const td: React.CSSProperties = { padding: "7px 10px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" };
