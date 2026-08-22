"use client";

// VIORA UNIFIED DASHBOARD — Orders tab (Phase 1).
//
// One password-protected home for the business: live Orders (with the courier
// picker + P&L landing in later phases), plus quick links to the existing Inbox
// and Broadcast tools. Passcode = INBOX_SECRET, stored in localStorage under the
// SAME key the inbox/broadcast pages use, so signing in once covers all three.
//
// This first cut renders the persistent order log (from /api/dashboard/orders):
// date, id, product, customer, qty, selling price, payment, courier, status.
// Money/status columns fill in as later phases wire the picker + courier webhooks
// + Velocity payments pull.

import { useCallback, useEffect, useMemo, useState } from "react";

const KEY_STORE = "viora_inbox_key"; // shared with /inbox and /broadcast

// Viora brand palette (ruby / champagne gold / cream) — matches /broadcast.
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
  warn: "#B8860B",
};
const HEADER_BG = "linear-gradient(135deg, #1A1410 0%, #5A0A18 100%)";
const SERIF = "var(--font-cormorant), Georgia, 'Times New Roman', serif";

type Order = {
  orderId: string;
  createdAt: number;
  name: string;
  phone: string;
  product: string;
  dCode: string;
  colour: string;
  qty: number;
  sellingPrice: number;
  paymentMode: string;
  courier: string;
  awb: string;
  status: string;
  freight: number | null;
  rtoCost: number | null;
  address: { city?: string; state?: string; postalCode?: string } | null;
};

const money = (v: number | null | undefined) =>
  v == null || v === 0 ? (v === 0 ? "₹0" : "—") : `₹${Number(v).toLocaleString("en-IN")}`;

const fmtDate = (ms: number) =>
  ms
    ? new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

// Status → colour + label. Neutral for "new", green delivered, red RTO/cancelled.
const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  new: { bg: "#EFE4CE", fg: "#7A716C", label: "New" },
  created: { bg: "#E7EEF7", fg: "#2C5282", label: "Created" },
  dispatched: { bg: "#E7F0FF", fg: "#2B6CB0", label: "Dispatched" },
  out_for_delivery: { bg: "#FFF3D6", fg: "#B8860B", label: "Out for delivery" },
  delivered: { bg: "#DCF3E5", fg: "#1E874B", label: "Delivered" },
  rto: { bg: "#FBE3E1", fg: "#C0392B", label: "RTO" },
  cancelled: { bg: "#F0E6E6", fg: "#8A5A5A", label: "Cancelled" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.new;
  return (
    <span
      style={{
        background: s.bg,
        color: s.fg,
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

export default function DashboardPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [pass, setPass] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  // Restore a saved passcode on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY_STORE) || "";
      if (saved) {
        setKey(saved);
        setAuthed(true);
      }
    } catch {}
  }, []);

  const load = useCallback(
    async (k: string) => {
      if (!k) return;
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/dashboard/orders?key=${encodeURIComponent(k)}&limit=500`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          if (res.status === 401) {
            setError("Wrong passcode.");
            setAuthed(false);
            try {
              localStorage.removeItem(KEY_STORE);
            } catch {}
          } else {
            setError(data.error || `Error ${res.status}`);
          }
          return;
        }
        setOrders(data.orders || []);
        setTotal(data.total || 0);
      } catch (e: any) {
        setError(e?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (authed && key) load(key);
  }, [authed, key, load]);

  const signIn = () => {
    const k = pass.trim();
    if (!k) return;
    try {
      localStorage.setItem(KEY_STORE, k);
    } catch {}
    setKey(k);
    setAuthed(true);
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return orders;
    return orders.filter((o) =>
      [o.orderId, o.name, o.phone, o.product, o.dCode, o.courier, o.status]
        .join(" ")
        .toLowerCase()
        .includes(s)
    );
  }, [orders, q]);

  // --- passcode gate --------------------------------------------------------
  if (!authed) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: 32,
            width: "100%",
            maxWidth: 380,
            boxShadow: "0 8px 30px rgba(90,10,24,0.08)",
          }}
        >
          <h1 style={{ fontFamily: SERIF, fontSize: 28, color: C.plumDark, margin: 0 }}>
            Viora Dashboard
          </h1>
          <p style={{ color: C.sub, fontSize: 14, marginTop: 6 }}>
            Enter the passcode to continue.
          </p>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && signIn()}
            placeholder="Passcode"
            style={{
              width: "100%",
              marginTop: 16,
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${C.border}`,
              fontSize: 15,
              boxSizing: "border-box",
            }}
          />
          {error && <p style={{ color: C.bad, fontSize: 13, marginTop: 8 }}>{error}</p>}
          <button
            onClick={signIn}
            style={{
              width: "100%",
              marginTop: 14,
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              background: HEADER_BG,
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  // --- dashboard ------------------------------------------------------------
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      {/* header */}
      <div style={{ background: HEADER_BG, color: "#fff", padding: "18px 24px" }}>
        <div
          style={{
            maxWidth: 1400,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ fontFamily: SERIF, fontSize: 26, margin: 0 }}>Viora Dashboard</h1>
          <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={tabStyle(true)}>Orders</span>
            <a href="/inbox" style={tabStyle(false)}>
              Inbox
            </a>
            <a href="/broadcast" style={tabStyle(false)}>
              Broadcast
            </a>
          </nav>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
        {/* toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ color: C.sub, fontSize: 14 }}>
            {loading ? "Loading…" : `${filtered.length} of ${total} orders`}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search order / name / phone / product…"
              style={{
                padding: "9px 12px",
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                fontSize: 14,
                minWidth: 260,
                background: C.card,
              }}
            />
            <button
              onClick={() => load(key)}
              style={{
                padding: "9px 16px",
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: C.card,
                color: C.text,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              background: "#FBE3E1",
              color: C.bad,
              padding: "10px 14px",
              borderRadius: 10,
              marginBottom: 12,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* table */}
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: C.cream2, textAlign: "left" }}>
                  {[
                    "Date",
                    "Order ID",
                    "Product",
                    "Customer",
                    "Qty",
                    "Selling ₹",
                    "Payment",
                    "Courier",
                    "Status",
                    "Freight ₹",
                    "RTO ₹",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "11px 12px",
                        fontWeight: 700,
                        color: C.plumDark,
                        whiteSpace: "nowrap",
                        borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.orderId} style={{ borderBottom: `1px solid ${C.cream2}` }}>
                    <td style={td}>{fmtDate(o.createdAt)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>#{o.orderId}</td>
                    <td style={td}>
                      <div>{o.product || "—"}</div>
                      {(o.dCode || o.colour) && (
                        <div style={{ color: C.sub, fontSize: 12 }}>
                          {[o.dCode, o.colour].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      <div>{o.name || "—"}</div>
                      {o.phone && <div style={{ color: C.sub, fontSize: 12 }}>{o.phone}</div>}
                      {o.address?.state && (
                        <div style={{ color: C.sub, fontSize: 12 }}>{o.address.state}</div>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>{o.qty || 1}</td>
                    <td style={td}>{money(o.sellingPrice)}</td>
                    <td style={td}>
                      <span
                        style={{
                          color: o.paymentMode === "PREPAID" ? C.ok : C.warn,
                          fontWeight: 600,
                        }}
                      >
                        {o.paymentMode || "—"}
                      </span>
                    </td>
                    <td style={{ ...td, textTransform: "capitalize" }}>{o.courier || "—"}</td>
                    <td style={td}>
                      <StatusBadge status={o.status || "new"} />
                    </td>
                    <td style={td}>{money(o.freight)}</td>
                    <td style={td}>{money(o.rtoCost)}</td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ ...td, textAlign: "center", color: C.sub, padding: 40 }}>
                      No orders yet. New orders will appear here automatically.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p style={{ color: C.sub, fontSize: 12, marginTop: 14 }}>
          Courier picker, profit/P&L, and the EOM report are coming in the next phases.
        </p>
      </div>
    </div>
  );
}

const td: React.CSSProperties = { padding: "11px 12px", verticalAlign: "top" };

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: "7px 16px",
    borderRadius: 999,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    color: active ? C.plumDark : "#fff",
    background: active ? C.gold : "rgba(255,255,255,0.12)",
  };
}
