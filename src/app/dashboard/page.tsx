"use client";

// VIORA UNIFIED DASHBOARD — mirrors the Sales Report Excel as a live dashboard.
//
// One password-protected home (passcode = INBOX_SECRET, shared with inbox/broadcast).
// Everything on the Summary / Orders / RTO / Products tabs is COMPUTED client-side
// from the persistent order log at /api/dashboard/orders — no extra backend. (COD
// remittance + Inventory tabs, which need courier/stock data, come next.)

import { useCallback, useEffect, useMemo, useState } from "react";

const KEY_STORE = "viora_inbox_key";

const C = {
  plum: "#9B1B30", plumDark: "#5A0A18", gold: "#C9A66B", goldDark: "#A9844C",
  bg: "#F5F1EA", card: "#FFFDF8", cream2: "#EFE4CE", border: "#D8C8B3",
  sub: "#7A716C", text: "#1A1410", ok: "#1E874B", bad: "#C0392B", warn: "#B8860B",
};
const HEADER_BG = "linear-gradient(135deg, #1A1410 0%, #5A0A18 100%)";
const SERIF = "var(--font-cormorant), Georgia, 'Times New Roman', serif";

// D-code catalog: display name + goods cost (base + ₹30 packaging). Base costs
// from the Product Costs sheet; blanks are editable later.
const CATALOG: Record<string, { name: string; base: number | null }> = {
  "D-001": { name: "Ethnic Jewellery Set (Blue)", base: 160 },
  "D-002": { name: "Emerald Bloom Ensemble (Pink)", base: 260 },
  "D-003": { name: "Ethnic Jewellery Set (D-003)", base: 220 },
  "D-004": { name: "Ethnic Jewellery Set (D-004)", base: 220 },
  "D-005": { name: "Ethnic Jewellery Set (D-005)", base: 220 },
  "D-007": { name: "Azure Empress Sapphire Set", base: 210 },
  "D-011": { name: "Rosa Blush Set", base: null },
  "D-018": { name: "Scarlet Bloom Set", base: 120 },
  "D-021": { name: "Crystal Wings Set", base: 100 },
};
const goodsCostOf = (code: string) => {
  const c = CATALOG[code];
  return c && c.base != null ? c.base + 30 : null;
};

type Order = {
  orderId: string; createdAt: number; month?: string; name: string; phone: string;
  product: string; dCode: string; colour: string; qty: number; sellingPrice: number;
  paymentMode: string; courier: string; awb: string; status: string;
  deliveryStatus?: string; pickupStatus?: string; transitStatus?: string;
  freight: number | null; goodsCost?: number | null; profit?: number | null;
  rtoCost: number | null; address: { city?: string; state?: string } | null;
};

const rupee = (v: number | null | undefined) =>
  v == null ? "—" : `₹${Math.round(Number(v)).toLocaleString("en-IN")}`;
const rupee2 = (v: number | null | undefined) =>
  v == null || v === 0 ? (v === 0 ? "₹0" : "—") : `₹${Number(v).toLocaleString("en-IN")}`;
const fmtDate = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const monthLabel = (m: string) => {
  if (!m) return "—";
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  new: { bg: "#EFE4CE", fg: "#7A716C", label: "New" },
  not_shipped: { bg: "#EFE4CE", fg: "#7A716C", label: "Not shipped" },
  on_hold: { bg: "#FFF3D6", fg: "#B8860B", label: "On hold" },
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
    <span style={{ background: s.bg, color: s.fg, padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

type Tab = "summary" | "orders" | "rto" | "products" | "inventory" | "cod";
type Meta = {
  inventory: { code: string; colour: string; qty: number }[];
  cod: Record<string, { label: string; value: string }[]>;
};

export default function DashboardPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [pass, setPass] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [meta, setMeta] = useState<Meta>({ inventory: [], cod: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("summary");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY_STORE) || "";
      if (saved) { setKey(saved); setAuthed(true); }
    } catch {}
  }, []);

  const load = useCallback(async (k: string) => {
    if (!k) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/dashboard/orders?key=${encodeURIComponent(k)}&limit=2000`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (res.status === 401) { setError("Wrong passcode."); setAuthed(false); try { localStorage.removeItem(KEY_STORE); } catch {} }
        else setError(data.error || `Error ${res.status}`);
        return;
      }
      setOrders(data.orders || []);
      // meta (inventory + COD) is best-effort — never blocks the orders view.
      try {
        const mres = await fetch(`/api/dashboard/meta?key=${encodeURIComponent(k)}`, { cache: "no-store" });
        const mdata = await mres.json();
        if (mres.ok && mdata.ok && mdata.meta) setMeta({ inventory: mdata.meta.inventory || [], cod: mdata.meta.cod || {} });
      } catch {}
    } catch (e: any) { setError(e?.message || "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authed && key) load(key); }, [authed, key, load]);

  const signIn = () => {
    const k = pass.trim();
    if (!k) return;
    try { localStorage.setItem(KEY_STORE, k); } catch {}
    setKey(k); setAuthed(true);
  };

  // ---- aggregations -------------------------------------------------------
  const monthOf = (o: Order) => o.month || (o.createdAt ? new Date(o.createdAt).toISOString().slice(0, 7) : "");
  const isRto = (o: Order) => o.status === "rto";
  const isCancelled = (o: Order) => o.status === "cancelled";
  const isDelivered = (o: Order) => o.status === "delivered";

  const kpi = useMemo(() => {
    const revenue = sum(orders.map((o) => o.sellingPrice || 0));
    const grossProfit = sum(orders.map((o) => o.profit || 0));
    const shipped = orders.filter((o) => !["new", "not_shipped", "cancelled", "on_hold"].includes(o.status));
    const delivered = orders.filter(isDelivered).length;
    const rto = orders.filter(isRto).length;
    const cancelled = orders.filter(isCancelled).length;
    const rtoBase = delivered + rto; // shipped-and-resolved
    return {
      total: orders.length,
      revenue,
      grossProfit,
      aov: orders.length ? revenue / orders.length : 0,
      delivered, rto, cancelled,
      shipped: shipped.length,
      rtoRate: rtoBase ? (rto / rtoBase) * 100 : 0,
      deliveryRate: rtoBase ? (delivered / rtoBase) * 100 : 0,
    };
  }, [orders]);

  const monthly = useMemo(() => {
    const map: Record<string, { orders: number; revenue: number; profit: number; delivered: number; rto: number }> = {};
    for (const o of orders) {
      const m = monthOf(o);
      if (!m) continue;
      const e = (map[m] ||= { orders: 0, revenue: 0, profit: 0, delivered: 0, rto: 0 });
      e.orders++; e.revenue += o.sellingPrice || 0; e.profit += o.profit || 0;
      if (isDelivered(o)) e.delivered++; if (isRto(o)) e.rto++;
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [orders]);

  const byProduct = useMemo(() => {
    const map: Record<string, { orders: number; units: number; revenue: number; profit: number; rto: number }> = {};
    for (const o of orders) {
      const code = o.dCode || "—";
      const e = (map[code] ||= { orders: 0, units: 0, revenue: 0, profit: 0, rto: 0 });
      e.orders++; e.units += o.qty || 1; e.revenue += o.sellingPrice || 0; e.profit += o.profit || 0;
      if (isRto(o)) e.rto++;
    }
    return Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [orders]);

  const statusBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of orders) map[o.status] = (map[o.status] || 0) + 1;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [orders]);

  const rtoByCourier = useMemo(() => {
    const map: Record<string, { total: number; rto: number }> = {};
    for (const o of orders) {
      if (!["delivered", "rto"].includes(o.status)) continue;
      const c = o.courier || "unknown";
      const e = (map[c] ||= { total: 0, rto: 0 });
      e.total++; if (isRto(o)) e.rto++;
    }
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [orders]);

  const rtoByPayment = useMemo(() => {
    const map: Record<string, { total: number; rto: number }> = {};
    for (const o of orders) {
      if (!["delivered", "rto"].includes(o.status)) continue;
      const p = o.paymentMode || "—";
      const e = (map[p] ||= { total: 0, rto: 0 });
      e.total++; if (isRto(o)) e.rto++;
    }
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [orders]);

  // ---- gate ---------------------------------------------------------------
  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32, width: "100%", maxWidth: 380, boxShadow: "0 8px 30px rgba(90,10,24,0.08)" }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 28, color: C.plumDark, margin: 0 }}>Viora Dashboard</h1>
          <p style={{ color: C.sub, fontSize: 14, marginTop: 6 }}>Enter the passcode to continue.</p>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && signIn()} placeholder="Passcode"
            style={{ width: "100%", marginTop: 16, padding: "12px 14px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 15, boxSizing: "border-box" }} />
          {error && <p style={{ color: C.bad, fontSize: 13, marginTop: 8 }}>{error}</p>}
          <button onClick={signIn} style={{ width: "100%", marginTop: 14, padding: "12px 14px", borderRadius: 10, border: "none", background: HEADER_BG, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Sign in</button>
        </div>
      </div>
    );
  }

  const TABS: [Tab, string][] = [["summary", "Summary"], ["orders", "Orders"], ["rto", "RTO Report"], ["products", "Products"], ["inventory", "Inventory"], ["cod", "COD & Freight"]];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      <div style={{ background: HEADER_BG, color: "#fff", padding: "16px 24px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 26, margin: 0 }}>Viora Dashboard</h1>
          <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TABS.map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)} style={pill(tab === t)}>{label}</button>
            ))}
            <a href="/inbox" style={pill(false)}>Inbox</a>
            <a href="/broadcast" style={pill(false)}>Broadcast</a>
          </nav>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ color: C.sub, fontSize: 14 }}>{loading ? "Loading…" : `${orders.length} orders loaded`}</div>
          <button onClick={() => load(key)} style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>↻ Refresh</button>
        </div>
        {error && <div style={{ background: "#FBE3E1", color: C.bad, padding: "10px 14px", borderRadius: 10, marginBottom: 12, fontSize: 14 }}>{error}</div>}

        {tab === "summary" && <SummaryTab kpi={kpi} monthly={monthly} byProduct={byProduct} statusBreakdown={statusBreakdown} />}
        {tab === "orders" && <OrdersTab orders={orders} loading={loading} apiKey={key} onChanged={() => load(key)} />}
        {tab === "rto" && <RtoTab kpi={kpi} byProduct={byProduct} rtoByCourier={rtoByCourier} rtoByPayment={rtoByPayment} />}
        {tab === "products" && <ProductsTab byProduct={byProduct} />}
        {tab === "inventory" && <InventoryTab inventory={meta.inventory} />}
        {tab === "cod" && <CodTab cod={meta.cod} />}
      </div>
    </div>
  );
}

// ============================ Summary =====================================
function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", minWidth: 150, flex: "1 1 150px" }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.sub, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: tone || C.plumDark, marginTop: 6, fontFamily: SERIF }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily: SERIF, fontSize: 22, color: C.plumDark, margin: "26px 0 12px" }}>{children}</h2>;
}
function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>{children}</div>
    </div>
  );
}
const th: React.CSSProperties = { padding: "11px 12px", fontWeight: 700, color: C.plumDark, whiteSpace: "nowrap", textAlign: "left", borderBottom: `1px solid ${C.border}`, background: C.cream2 };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top", borderBottom: `1px solid ${C.cream2}` };
const tnum: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" };

function SummaryTab({ kpi, monthly, byProduct, statusBreakdown }: any) {
  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Card label="Total Orders" value={String(kpi.total)} />
        <Card label="Revenue" value={rupee(kpi.revenue)} />
        <Card label="Gross Profit" value={rupee(kpi.grossProfit)} tone={kpi.grossProfit >= 0 ? C.ok : C.bad} />
        <Card label="Avg Order Value" value={rupee(kpi.aov)} />
        <Card label="Delivered" value={String(kpi.delivered)} sub={`${kpi.deliveryRate.toFixed(0)}% of shipped`} tone={C.ok} />
        <Card label="RTO" value={String(kpi.rto)} sub={`${kpi.rtoRate.toFixed(0)}% RTO rate`} tone={C.bad} />
        <Card label="Cancelled" value={String(kpi.cancelled)} />
      </div>

      <SectionTitle>Monthly Summary</SectionTitle>
      <TableWrap>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead><tr>
            <th style={th}>Month</th><th style={{ ...th, textAlign: "right" }}>Orders</th>
            <th style={{ ...th, textAlign: "right" }}>Revenue</th><th style={{ ...th, textAlign: "right" }}>Gross Profit</th>
            <th style={{ ...th, textAlign: "right" }}>Delivered</th><th style={{ ...th, textAlign: "right" }}>RTO</th>
          </tr></thead>
          <tbody>
            {monthly.map(([m, e]: any) => (
              <tr key={m}>
                <td style={{ ...td, fontWeight: 600 }}>{monthLabel(m)}</td>
                <td style={tnum}>{e.orders}</td>
                <td style={tnum}>{rupee(e.revenue)}</td>
                <td style={{ ...tnum, color: e.profit >= 0 ? C.ok : C.bad, fontWeight: 700 }}>{rupee(e.profit)}</td>
                <td style={tnum}>{e.delivered}</td>
                <td style={{ ...tnum, color: C.bad }}>{e.rto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 420px" }}>
          <SectionTitle>Revenue by Product</SectionTitle>
          <TableWrap>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead><tr>
                <th style={th}>Product</th><th style={{ ...th, textAlign: "right" }}>Units</th>
                <th style={{ ...th, textAlign: "right" }}>Revenue</th><th style={{ ...th, textAlign: "right" }}>Profit</th>
              </tr></thead>
              <tbody>
                {byProduct.map(([code, e]: any) => (
                  <tr key={code}>
                    <td style={td}><b>{code}</b>{CATALOG[code] && <div style={{ color: C.sub, fontSize: 12 }}>{CATALOG[code].name}</div>}</td>
                    <td style={tnum}>{e.units}</td>
                    <td style={tnum}>{rupee(e.revenue)}</td>
                    <td style={{ ...tnum, color: e.profit >= 0 ? C.ok : C.bad, fontWeight: 700 }}>{rupee(e.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
        <div style={{ flex: "1 1 280px" }}>
          <SectionTitle>Delivery Status</SectionTitle>
          <TableWrap>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <tbody>
                {statusBreakdown.map(([s, n]: any) => (
                  <tr key={s}>
                    <td style={td}><StatusBadge status={s} /></td>
                    <td style={{ ...tnum, fontWeight: 700 }}>{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      </div>
    </div>
  );
}

// ============================ Orders ======================================
// An order is still "pickable" (needs a courier chosen) when no courier has been
// assigned yet and it isn't already shipped/closed. In HOLD mode new orders land
// here and wait for the operator to pick Velocity or Shiprocket.
const PICKABLE_STATUS = new Set(["new", "on_hold", "not_shipped", "created", "hold", ""]);
function isPickable(o: Order) {
  return !o.courier && PICKABLE_STATUS.has((o.status || "").toLowerCase());
}

// Couriers the picker offers. Adding a new one (e.g. iThink) later = one line here
// AND a real branch in /api/dashboard/assign-courier (until then an unknown courier
// is only RECORDED, to be shipped in that courier's own dashboard).
const PICKER_COURIERS: { id: string; label: string; color: string }[] = [
  { id: "velocity", label: "Velocity", color: "#6b4a8f" },
  { id: "shiprocket", label: "Shiprocket", color: "#5b3bd4" },
  // { id: "ithink", label: "iThink", color: "#0a7d5a" },  // <- future
];

// Per-row courier picker: creates the order in the chosen courier (create-only —
// lands in that courier's "New Orders", operator generates the AWB there).
function AssignCell({ order, apiKey, onChanged }: { order: Order; apiKey: string; onChanged: () => void }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const assign = async (courier: string, label: string) => {
    if (!window.confirm(`Create order #${order.orderId} on ${label}?`)) return;
    setBusy(courier); setErr("");
    try {
      const res = await fetch(`/api/dashboard/assign-courier?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-inbox-key": apiKey },
        body: JSON.stringify({ orderId: order.orderId, courier, ship: false }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setErr(typeof data.error === "string" ? data.error : `Error ${res.status}`); return; }
      onChanged();
    } catch (e: any) { setErr(e?.message || "Failed"); }
    finally { setBusy(""); }
  };

  if (!isPickable(order)) return <span style={{ color: C.sub }}>—</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 160 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {PICKER_COURIERS.map((c) => (
          <button key={c.id} disabled={!!busy} onClick={() => assign(c.id, c.label)} style={assignBtn(c.color)}>
            {busy === c.id ? "…" : `→ ${c.label}`}
          </button>
        ))}
      </div>
      {err && <div style={{ color: C.bad, fontSize: 11 }}>{err}</div>}
    </div>
  );
}
function assignBtn(bg: string): React.CSSProperties {
  return { padding: "5px 9px", borderRadius: 7, border: "none", background: bg, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };
}

function OrdersTab({ orders, loading, apiKey, onChanged }: { orders: Order[]; loading: boolean; apiKey: string; onChanged: () => void }) {
  const [q, setQ] = useState("");
  const [month, setMonth] = useState("all");
  const [needsCourier, setNeedsCourier] = useState(false);
  const months = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) => { const m = o.month || (o.createdAt ? new Date(o.createdAt).toISOString().slice(0, 7) : ""); if (m) s.add(m); });
    return Array.from(s).sort().reverse();
  }, [orders]);
  const pendingCount = useMemo(() => orders.filter(isPickable).length, [orders]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return orders.filter((o) => {
      if (needsCourier && !isPickable(o)) return false;
      const m = o.month || (o.createdAt ? new Date(o.createdAt).toISOString().slice(0, 7) : "");
      if (month !== "all" && m !== month) return false;
      if (!s) return true;
      return [o.orderId, o.name, o.phone, o.product, o.dCode, o.courier, o.status].join(" ").toLowerCase().includes(s);
    });
  }, [orders, q, month, needsCourier]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: "9px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, fontSize: 14 }}>
          <option value="all">All months</option>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order / name / phone / product…" style={{ padding: "9px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, minWidth: 260, background: C.card, flex: "1 1 260px" }} />
        <button onClick={() => setNeedsCourier((v) => !v)} style={{ padding: "9px 12px", borderRadius: 10, border: `1px solid ${needsCourier ? C.plum : C.border}`, background: needsCourier ? C.plum : C.card, color: needsCourier ? "#fff" : C.text, fontSize: 13.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          {needsCourier ? "✓ " : ""}Needs courier{pendingCount ? ` (${pendingCount})` : ""}
        </button>
        <div style={{ color: C.sub, fontSize: 13, alignSelf: "center" }}>{filtered.length} orders</div>
      </div>
      <TableWrap>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead><tr>
            {["Date", "Order ID", "Product", "Customer", "Qty", "Selling ₹", "Payment", "Courier", "Status", "Freight ₹", "Cost ₹", "Profit ₹", "Assign"].map((h) => (
              <th key={h} style={{ ...th, textAlign: ["Qty", "Selling ₹", "Freight ₹", "Cost ₹", "Profit ₹"].includes(h) ? "right" : "left" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.orderId}>
                <td style={td}>{fmtDate(o.createdAt)}</td>
                <td style={{ ...td, fontWeight: 700 }}>#{o.orderId}</td>
                <td style={td}>{o.dCode || o.product || "—"}{o.colour && <div style={{ color: C.sub, fontSize: 12 }}>{o.colour}</div>}</td>
                <td style={td}>{o.name || "—"}{o.phone && <div style={{ color: C.sub, fontSize: 12 }}>{o.phone}</div>}</td>
                <td style={tnum}>{o.qty || 1}</td>
                <td style={tnum}>{rupee2(o.sellingPrice)}</td>
                <td style={td}><span style={{ color: o.paymentMode === "PREPAID" ? C.ok : C.warn, fontWeight: 600 }}>{o.paymentMode || "—"}</span></td>
                <td style={{ ...td, textTransform: "capitalize" }}>{o.courier || "—"}</td>
                <td style={td}><StatusBadge status={o.status || "new"} />
                  {(o.transitStatus || o.pickupStatus) && <div style={{ color: C.sub, fontSize: 11, marginTop: 3 }}>{[o.transitStatus, o.pickupStatus].filter(Boolean).join(" · ")}</div>}
                </td>
                <td style={tnum}>{rupee2(o.freight)}</td>
                <td style={tnum}>{rupee2(o.goodsCost)}</td>
                <td style={{ ...tnum, fontWeight: 700, color: o.profit == null ? C.sub : o.profit >= 0 ? C.ok : C.bad }}>{rupee2(o.profit)}</td>
                <td style={td}><AssignCell order={o} apiKey={apiKey} onChanged={onChanged} /></td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && <tr><td colSpan={13} style={{ ...td, textAlign: "center", color: C.sub, padding: 40 }}>No orders.</td></tr>}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}

// ============================ RTO =========================================
function RtoTab({ kpi, byProduct, rtoByCourier, rtoByPayment }: any) {
  const pct = (r: number, t: number) => (t ? ((r / t) * 100).toFixed(0) + "%" : "—");
  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Card label="RTO Orders" value={String(kpi.rto)} tone={C.bad} />
        <Card label="RTO Rate" value={`${kpi.rtoRate.toFixed(1)}%`} sub="of delivered + RTO" tone={C.bad} />
        <Card label="Delivered" value={String(kpi.delivered)} tone={C.ok} />
        <Card label="Delivery Rate" value={`${kpi.deliveryRate.toFixed(1)}%`} tone={C.ok} />
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 320px" }}>
          <SectionTitle>RTO by Courier</SectionTitle>
          <TableWrap>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead><tr><th style={th}>Courier</th><th style={{ ...th, textAlign: "right" }}>Shipped</th><th style={{ ...th, textAlign: "right" }}>RTO</th><th style={{ ...th, textAlign: "right" }}>RTO %</th></tr></thead>
              <tbody>
                {rtoByCourier.map(([c, e]: any) => (
                  <tr key={c}><td style={{ ...td, textTransform: "capitalize" }}>{c}</td><td style={tnum}>{e.total}</td><td style={{ ...tnum, color: C.bad }}>{e.rto}</td><td style={{ ...tnum, fontWeight: 700 }}>{pct(e.rto, e.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
        <div style={{ flex: "1 1 320px" }}>
          <SectionTitle>RTO by Payment</SectionTitle>
          <TableWrap>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead><tr><th style={th}>Payment</th><th style={{ ...th, textAlign: "right" }}>Shipped</th><th style={{ ...th, textAlign: "right" }}>RTO</th><th style={{ ...th, textAlign: "right" }}>RTO %</th></tr></thead>
              <tbody>
                {rtoByPayment.map(([p, e]: any) => (
                  <tr key={p}><td style={td}>{p}</td><td style={tnum}>{e.total}</td><td style={{ ...tnum, color: C.bad }}>{e.rto}</td><td style={{ ...tnum, fontWeight: 700 }}>{pct(e.rto, e.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      </div>

      <SectionTitle>RTO by Product</SectionTitle>
      <TableWrap>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead><tr><th style={th}>Product</th><th style={{ ...th, textAlign: "right" }}>Orders</th><th style={{ ...th, textAlign: "right" }}>RTO</th><th style={{ ...th, textAlign: "right" }}>RTO %</th></tr></thead>
          <tbody>
            {byProduct.map(([code, e]: any) => (
              <tr key={code}><td style={td}><b>{code}</b>{CATALOG[code] && <span style={{ color: C.sub, fontSize: 12 }}> · {CATALOG[code].name}</span>}</td><td style={tnum}>{e.orders}</td><td style={{ ...tnum, color: C.bad }}>{e.rto}</td><td style={{ ...tnum, fontWeight: 700 }}>{pct(e.rto, e.orders)}</td></tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}

// ============================ Products ====================================
function ProductsTab({ byProduct }: any) {
  const rows = byProduct.map(([code, e]: any) => ({ code, ...e, goods: goodsCostOf(code), name: CATALOG[code]?.name }));
  return (
    <div>
      <SectionTitle>Products — cost & performance</SectionTitle>
      <p style={{ color: C.sub, fontSize: 13, marginTop: -6, marginBottom: 12 }}>Goods cost = base + ₹30 packaging (real courier freight tracked per order). Blank cost = fill in later.</p>
      <TableWrap>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead><tr>
            <th style={th}>Code</th><th style={th}>Name</th>
            <th style={{ ...th, textAlign: "right" }}>Goods Cost</th><th style={{ ...th, textAlign: "right" }}>Units Sold</th>
            <th style={{ ...th, textAlign: "right" }}>Revenue</th><th style={{ ...th, textAlign: "right" }}>Profit</th>
            <th style={{ ...th, textAlign: "right" }}>RTO</th>
          </tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.code}>
                <td style={{ ...td, fontWeight: 700 }}>{r.code}</td>
                <td style={td}>{r.name || <span style={{ color: C.sub }}>—</span>}</td>
                <td style={tnum}>{r.goods == null ? "—" : rupee(r.goods)}</td>
                <td style={tnum}>{r.units}</td>
                <td style={tnum}>{rupee(r.revenue)}</td>
                <td style={{ ...tnum, color: r.profit >= 0 ? C.ok : C.bad, fontWeight: 700 }}>{rupee(r.profit)}</td>
                <td style={{ ...tnum, color: C.bad }}>{r.rto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}

// ============================ Inventory ===================================
function InventoryTab({ inventory }: { inventory: { code: string; colour: string; qty: number }[] }) {
  const byCode = useMemo(() => {
    const map: Record<string, { code: string; total: number; rows: { colour: string; qty: number }[] }> = {};
    for (const it of inventory) {
      const e = (map[it.code] ||= { code: it.code, total: 0, rows: [] });
      e.total += Number(it.qty) || 0;
      e.rows.push({ colour: it.colour, qty: Number(it.qty) || 0 });
    }
    return Object.values(map).sort((a, b) => a.code.localeCompare(b.code));
  }, [inventory]);
  const totalUnits = byCode.reduce((s, e) => s + e.total, 0);

  if (!inventory.length)
    return <div style={{ color: C.sub, padding: 30 }}>No inventory data yet.</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Card label="Products in stock" value={String(byCode.filter((e) => e.total > 0).length)} />
        <Card label="Total units in hand" value={String(totalUnits)} />
      </div>
      <SectionTitle>Stock by Product &amp; Colour</SectionTitle>
      <TableWrap>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead><tr><th style={th}>Product</th><th style={{ ...th, textAlign: "right" }}>Total</th><th style={th}>Colours</th></tr></thead>
          <tbody>
            {byCode.map((e) => (
              <tr key={e.code}>
                <td style={{ ...td, fontWeight: 700 }}>{e.code}{CATALOG[e.code] && <div style={{ color: C.sub, fontSize: 12, fontWeight: 400 }}>{CATALOG[e.code].name}</div>}</td>
                <td style={{ ...tnum, fontWeight: 700, color: e.total === 0 ? C.bad : e.total <= 5 ? C.warn : C.text }}>{e.total}</td>
                <td style={td}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {e.rows.map((r, i) => (
                      <span key={i} style={{ fontSize: 12, padding: "2px 9px", borderRadius: 999, background: r.qty === 0 ? "#FBE3E1" : C.cream2, color: r.qty === 0 ? C.bad : C.text, whiteSpace: "nowrap" }}>
                        {r.colour}: <b>{r.qty}</b>
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}

// ============================ COD & Freight ===============================
function CodTab({ cod }: { cod: Record<string, { label: string; value: string }[]> }) {
  const BLOCKS: [string, string][] = [
    ["shiprocket_cod", "Shiprocket — COD Remittance"],
    ["shiprocket_freight", "Shiprocket — Freight & VAS"],
    ["velocity_cod", "Velocity — COD Remittance"],
  ];
  const fmt = (v: string) => {
    const n = Number(v);
    return v && !Number.isNaN(n) ? `₹${n.toLocaleString("en-IN")}` : v || "—";
  };
  const has = Object.values(cod || {}).some((b) => b && b.length);
  return (
    <div>
      <div style={{ background: "#FFF8E6", border: `1px solid ${C.gold}`, borderRadius: 12, padding: "12px 16px", fontSize: 13.5, color: C.text, marginBottom: 6 }}>
        📌 Snapshot from the Sales Report (updated manually from courier dashboards). Live auto-sync from the Velocity Payments section is the next phase.
      </div>
      {!has && <div style={{ color: C.sub, padding: 30 }}>No COD/freight data yet.</div>}
      {BLOCKS.map(([k, title]) =>
        cod?.[k]?.length ? (
          <div key={k}>
            <SectionTitle>{title}</SectionTitle>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {cod[k].map((it, i) => (
                <Card key={i} label={it.label} value={fmt(it.value)} />
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}

function pill(active: boolean): React.CSSProperties {
  return { padding: "7px 15px", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "none", border: "none", color: active ? C.plumDark : "#fff", background: active ? C.gold : "rgba(255,255,255,0.12)" };
}
