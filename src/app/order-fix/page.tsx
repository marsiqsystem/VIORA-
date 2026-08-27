"use client";

// /order-fix — operator tool to correct the product/colour on a placed order.
//
// When a customer changes colour/variant after ordering, the operator edits the
// item in Velocity — but the Wix order still holds the OLD product, so the
// dispatched / out-for-delivery / delivered / cancelled WhatsApp messages would
// show the old colour. Here the operator pastes the NEW colour's product link;
// we resolve its real name + photo and store an override that the status
// pipeline applies before every message for that order.
//
// Passcode = INBOX_SECRET (same as /inbox and /dashboard), remembered locally.

import { useEffect, useState } from "react";

const KEY_STORE = "viora_inbox_key";

type Override = {
  orderId: string;
  product?: string;
  productImage?: string;
  note?: string;
  updatedAt?: string;
};

export default function OrderFixPage() {
  const [key, setKey] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [productLink, setProductLink] = useState("");
  const [customName, setCustomName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  useEffect(() => {
    try {
      const k = localStorage.getItem(KEY_STORE) || "";
      if (k) setKey(k);
    } catch {
      /* ignore */
    }
  }, []);

  function rememberKey(k: string) {
    setKey(k);
    try {
      localStorage.setItem(KEY_STORE, k);
    } catch {
      /* ignore */
    }
  }

  async function loadList(k = key) {
    if (!k) return;
    setLoadingList(true);
    try {
      const res = await fetch("/api/admin/order-override", {
        headers: { "x-inbox-key": k },
      });
      const data = await res.json();
      if (data?.ok) setOverrides(data.overrides || []);
    } catch {
      /* ignore */
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (key) loadList(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!orderNumber.trim()) {
      setMsg({ ok: false, text: "Order number daalein." });
      return;
    }
    if (!productLink.trim() && !customName.trim()) {
      setMsg({ ok: false, text: "Naye colour ka product link paste karein (ya naam type karein)." });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/order-override", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-inbox-key": key },
        body: JSON.stringify({
          orderNumber: orderNumber.trim(),
          productLink: productLink.trim() || undefined,
          product: customName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data?.ok) {
        setMsg({
          ok: true,
          text: `Saved ✅  #${data.value.orderId} → "${data.value.product}"${
            data.value.productImage ? " (photo bhi set)" : " (photo nahi mili — logo header jaayega)"
          }`,
        });
        setOrderNumber("");
        setProductLink("");
        setCustomName("");
        loadList();
      } else {
        setMsg({ ok: false, text: data?.error || "Save fail hua." });
      }
    } catch (err: any) {
      setMsg({ ok: false, text: "Network error." });
    } finally {
      setSaving(false);
    }
  }

  async function remove(orderId: string) {
    if (!key) return;
    try {
      const res = await fetch("/api/admin/order-override", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-inbox-key": key },
        body: JSON.stringify({ orderNumber: orderId }),
      });
      const data = await res.json();
      if (data?.ok) loadList();
    } catch {
      /* ignore */
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Order color / product fix</h1>
        <p style={styles.sub}>
          Customer ne color badla? Velocity pe item edit karne ke baad, yahan uska{" "}
          <b>order number</b> aur <b>naye color ka product link</b> daal do. Uske baad ke saare
          WhatsApp messages (dispatch / out-for-delivery / delivered) sahi color + photo dikhayenge.
        </p>

        <label style={styles.label}>Passcode</label>
        <input
          type="password"
          value={key}
          onChange={(e) => rememberKey(e.target.value)}
          placeholder="INBOX passcode"
          style={styles.input}
        />

        <form onSubmit={save}>
          <label style={styles.label}>Order number</label>
          <input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="e.g. 10241"
            style={styles.input}
          />

          <label style={styles.label}>Naye color ka product link</label>
          <input
            value={productLink}
            onChange={(e) => setProductLink(e.target.value)}
            placeholder="https://viorajewel.in/... (naye color ka product page)"
            style={styles.input}
          />
          <div style={styles.hint}>
            Site pe naye color ka product kholo → URL copy karke yahan paste karo. Naam + photo
            apne aap aa jaayega.
          </div>

          <label style={styles.label}>
            Product ka naam (optional — link se auto aata hai; sirf custom text chahiye to)
          </label>
          <input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="e.g. Eternal Shine Set – Red"
            style={styles.input}
          />

          <button type="submit" disabled={saving} style={styles.button}>
            {saving ? "Saving…" : "Save fix"}
          </button>
        </form>

        {msg && (
          <div style={{ ...styles.msg, ...(msg.ok ? styles.msgOk : styles.msgErr) }}>{msg.text}</div>
        )}
      </div>

      <div style={styles.card}>
        <h2 style={styles.h2}>
          Active fixes {loadingList ? "…" : `(${overrides.length})`}
        </h2>
        {overrides.length === 0 && <p style={styles.sub}>Abhi koi override nahi hai.</p>}
        {overrides.map((o) => (
          <div key={o.orderId} style={styles.row}>
            {o.productImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={o.productImage} alt="" style={styles.thumb} />
            ) : (
              <div style={{ ...styles.thumb, ...styles.thumbEmpty }}>logo</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.rowTitle}>#{o.orderId}</div>
              <div style={styles.rowProduct}>{o.product}</div>
              {o.updatedAt && (
                <div style={styles.rowMeta}>{new Date(o.updatedAt).toLocaleString()}</div>
              )}
            </div>
            <button onClick={() => remove(o.orderId)} style={styles.removeBtn}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f4f1ec",
    padding: "24px 16px",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#2b2b2b",
  },
  card: {
    maxWidth: 560,
    margin: "0 auto 20px",
    background: "#fff",
    borderRadius: 14,
    padding: 22,
    boxShadow: "0 2px 14px rgba(0,0,0,0.06)",
  },
  h1: { fontSize: 22, fontWeight: 700, margin: "0 0 6px" },
  h2: { fontSize: 17, fontWeight: 700, margin: "0 0 12px" },
  sub: { fontSize: 13.5, lineHeight: 1.5, color: "#555", margin: "0 0 14px" },
  label: { display: "block", fontSize: 12.5, fontWeight: 600, margin: "12px 0 5px", color: "#444" },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    border: "1px solid #d9d3c8",
    fontSize: 14,
    boxSizing: "border-box",
    background: "#fbfaf7",
  },
  hint: { fontSize: 11.5, color: "#888", margin: "5px 0 2px" },
  button: {
    marginTop: 16,
    width: "100%",
    padding: "11px 14px",
    borderRadius: 9,
    border: "none",
    background: "#7a5b2e",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  msg: { marginTop: 14, padding: "10px 12px", borderRadius: 9, fontSize: 13.5 },
  msgOk: { background: "#e7f5ea", color: "#1c6b34" },
  msgErr: { background: "#fdecec", color: "#a12626" },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 0",
    borderTop: "1px solid #efeae1",
  },
  thumb: { width: 46, height: 46, borderRadius: 8, objectFit: "cover", background: "#eee", flexShrink: 0 },
  thumbEmpty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    color: "#aaa",
  },
  rowTitle: { fontWeight: 700, fontSize: 14 },
  rowProduct: { fontSize: 13, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rowMeta: { fontSize: 11, color: "#aaa", marginTop: 2 },
  removeBtn: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #e2b4b4",
    background: "#fff",
    color: "#a12626",
    fontSize: 12.5,
    cursor: "pointer",
    flexShrink: 0,
  },
};
