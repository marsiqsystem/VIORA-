"use client";

// VIORA UNIFIED DASHBOARD — mirrors the Sales Report Excel as a live dashboard.
//
// One password-protected home (passcode = INBOX_SECRET, shared with inbox/broadcast).
// Everything on the Summary / Orders / RTO / Products tabs is COMPUTED client-side
// from the persistent order log at /api/dashboard/orders — no extra backend. (COD
// remittance + Inventory tabs, which need courier/stock data, come next.)

import { useCallback, useEffect, useMemo, useState } from "react";
import { recommend as recoFor, national as engineNational, fakeNonServiceable as engineFake, generatedAt as engineGeneratedAt, type Reco } from "@/lib/crm/carrierEngine";

const KEY_STORE = "viora_inbox_key";

const C = {
  plum: "#9B1B30", plumDark: "#5A0A18", gold: "#C9A66B", goldDark: "#A9844C",
  bg: "#F5F1EA", card: "#FFFDF8", cream2: "#EFE4CE", border: "#D8C8B3",
  sub: "#7A716C", text: "#1A1410", ok: "#1E874B", bad: "#C0392B", warn: "#B8860B",
};
const HEADER_BG = "linear-gradient(135deg, #1A1410 0%, #5A0A18 100%)";
const SERIF = "var(--font-heading), Georgia, 'Times New Roman', serif";

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
  rtoCost: number | null;
  address: { line1?: string; line2?: string; line3?: string; city?: string; state?: string; postalCode?: string; country?: string } | null;
  addressText?: string; addressEdited?: boolean;
  courierService?: string; // actual iThink carrier booked (e.g. "shadowfax")
  callOutcome?: string; // "confirmed" | "cancelled" — set from the Call Queue
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

type Tab = "summary" | "shipqueue" | "callqueue" | "orders" | "rto" | "products" | "inventory" | "cod";
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

  const TABS: [Tab, string][] = [["summary", "Summary"], ["shipqueue", "Ship Queue"], ["callqueue", "Call Queue"], ["orders", "Orders"], ["rto", "RTO Report"], ["products", "Products"], ["inventory", "Inventory"], ["cod", "COD & Freight"]];

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
        {tab === "shipqueue" && <ShipQueueTab orders={orders} loading={loading} apiKey={key} onChanged={() => load(key)} />}
        {tab === "callqueue" && <CallQueueTab apiKey={key} onChanged={() => load(key)} />}
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

// Couriers the picker offers. Adding a new one later = one line here AND a real
// branch in /api/dashboard/assign-courier (until then an unknown courier is only
// RECORDED, to be shipped in that courier's own dashboard).
//
// These CREATE-ONLY buttons record the order + chosen courier WITHOUT booking or
// charging: Velocity/Shiprocket land the order in their "New Orders", so picking a
// courier here never debits a wallet.
//
// iThink is deliberately NOT in this picker: its API has no draft/"New Orders"
// state, so "recording" it would do nothing on iThink's side (a common source of
// confusion — it looked booked but never reached iThink). Instead iThink has its
// own single, explicit "💸 Book on iThink" button that books + charges in one step.
const PICKER_COURIERS: { id: string; label: string; color: string }[] = [
  { id: "velocity", label: "Velocity", color: "#6b4a8f" },
  { id: "shiprocket", label: "Shiprocket", color: "#5b3bd4" },
];

// The picker stays available while an order is still pre-shipment, EVEN if a
// courier was already chosen — so an order created on one courier (e.g. Velocity
// with poor rates) can be re-created on another. Truly shipped statuses
// (dispatched/delivered/rto/cancelled) fall out of PICKABLE_STATUS and lock.
function canAssign(o: Order) {
  return PICKABLE_STATUS.has((o.status || "").toLowerCase());
}

// An order can be cancelled from the dashboard until it reaches a terminal state
// (already cancelled, delivered, or returned). This lets the operator cancel a
// NEW order directly — no need to push it to a courier first.
const CANCEL_TERMINAL = new Set(["cancelled", "canceled", "delivered", "rto"]);
function canCancel(o: Order) {
  return !CANCEL_TERMINAL.has((o.status || "").toLowerCase());
}

// Per-row courier picker: creates the order in the chosen courier (create-only —
// lands in that courier's "New Orders", operator generates the AWB there).
function AssignCell({ order, apiKey, onChanged }: { order: Order; apiKey: string; onChanged: () => void }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [rate, setRate] = useState<any>(null);

  // --- Ship-to address editor (one box → auto pincode + city/state → all couriers) ---
  const reconstructAddr = () => {
    if (order.addressText) return order.addressText;
    const a = order.address || {};
    return [a.line1, a.line2, a.line3, [a.city, a.state, a.postalCode].filter(Boolean).join(", "), a.country]
      .filter(Boolean)
      .join("\n");
  };
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrText, setAddrText] = useState("");
  const [addrMsg, setAddrMsg] = useState("");
  const openAddr = () => { setAddrText(reconstructAddr()); setAddrMsg(""); setErr(""); setAddrOpen(true); };
  const saveAddr = async () => {
    const text = addrText.trim();
    if (!text) { setErr("Address is empty."); return; }
    setBusy("addr"); setErr(""); setAddrMsg("");
    try {
      const res = await fetch(`/api/dashboard/update-address?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-inbox-key": apiKey },
        body: JSON.stringify({ orderId: order.orderId, addressText: text }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setErr(typeof data.error === "string" ? data.error : `Error ${res.status}`); return; }
      const r = data.resolved || {};
      setAddrMsg(
        `Saved ✓  Pincode ${r.pincode || "—"}${r.city ? ` · ${r.city}` : ""}${r.state ? `, ${r.state}` : ""}` +
        (data.note ? `  — ${data.note}` : "")
      );
      setRate(null); // stale: re-compare on the new pincode
      onChanged();
    } catch (e: any) { setErr(e?.message || "Failed"); }
    finally { setBusy(""); }
  };

  // COMPARE RATES — read-only freight quotes from ALL THREE couriers (Velocity,
  // Shiprocket, iThink) side by side for THIS order's pincode + weight, quoted for
  // its actual payment mode (COD vs prepaid). Nothing is booked or charged on any
  // platform — the operator compares, then records + ships on the chosen courier.
  const checkRate = async () => {
    setBusy("rate"); setErr(""); setRate(null);
    try {
      const res = await fetch(`/api/dashboard/rate-compare?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-inbox-key": apiKey },
        body: JSON.stringify({ orderId: order.orderId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setErr(typeof data.error === "string" ? data.error : `Error ${res.status}`); return; }
      setRate(data);
    } catch (e: any) { setErr(e?.message || "Failed"); }
    finally { setBusy(""); }
  };

  // CREATE-ONLY: records the order + chosen courier without booking or charging.
  // Safe for all three couriers (iThink included — it no longer books/charges on
  // selection; it's booked later with bookIthink()).
  const assign = async (courier: string, label: string) => {
    const note =
      courier === "ithink"
        ? `\n\n(Nothing is booked or charged yet — you'll book & pay for iThink with the "💸 Book" button after checking rates.)`
        : `\n\n(Lands in ${label}'s New Orders — no charge; ship it there or later.)`;
    // If a courier is already recorded, this is a RE-create on a different one —
    // warn so the operator cancels the old one and avoids a double shipment.
    const msg = order.courier
      ? `Order #${order.orderId} is already on ${order.courier}.\n\nAlso record it on ${label}? Cancel the ${order.courier} one to avoid a double shipment.${note}`
      : `Create order #${order.orderId} on ${label}?${note}`;
    if (!window.confirm(msg)) return;
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

  // BOOK on iThink — the ONLY action that actually generates the AWB and debits the
  // iThink wallet. Behind an explicit, spelled-out double confirm so it can never be
  // a reflex/"just checking rates" click. iThink has no draft state, so this is how
  // an iThink-assigned order is shipped (there's no New Orders panel to ship from).
  // BOOK on iThink. Optionally book a SPECIFIC carrier the operator picked in the
  // rate-compare table (logistics = its logistic_name, serviceType = its
  // logistic_service_type). Without a pick it books the account default courier.
  const bookIthink = async (logistics?: string, serviceType?: string) => {
    // If the order was already recorded on another courier (e.g. it's sitting in
    // Velocity/Shiprocket "New Orders"), booking on iThink too would ship it twice.
    const dupWarn =
      order.courier && order.courier !== "ithink"
        ? `\n\n⚠️ This order is already recorded on ${order.courier}. If you also book it on iThink you'll ship it TWICE — cancel the ${order.courier} one first if you don't want that.`
        : "";
    const which = logistics ? ` via ${logistics}${serviceType ? ` (${serviceType})` : ""}` : "";
    const warn1 =
      `💸 BOOK #${order.orderId} on iThink${which} now?\n\nThis GENERATES the AWB and DEBITS your iThink wallet immediately — there is no undo from here (cancel in the iThink panel to refund). Only do this after you've compared the rate.${dupWarn}`;
    if (!window.confirm(warn1)) return;
    if (!window.confirm(`Last check: #${order.orderId} will be charged to your iThink wallet${which} the moment you press OK.`)) return;
    setBusy("book-ithink"); setErr("");
    try {
      const res = await fetch(`/api/dashboard/assign-courier?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-inbox-key": apiKey },
        body: JSON.stringify({
          orderId: order.orderId,
          courier: "ithink",
          ship: true,
          ...(logistics ? { logistics } : {}),
          ...(serviceType ? { serviceType } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setErr(typeof data.error === "string" ? data.error : `Error ${res.status}`); return; }
      onChanged();
    } catch (e: any) { setErr(e?.message || "Failed"); }
    finally { setBusy(""); }
  };

  const cancel = async () => {
    const warn = order.awb
      ? `Cancel order #${order.orderId}?\n\n⚠️ It's already on ${order.courier || "a courier"} (AWB ${order.awb}) — you'll still need to cancel that shipment in the courier dashboard.\n\nThe customer WILL be sent a cancellation WhatsApp. Continue?`
      : `Cancel order #${order.orderId}?\n\nThe customer WILL be sent a cancellation WhatsApp. Continue?`;
    if (!window.confirm(warn)) return;
    setBusy("cancel"); setErr("");
    try {
      const res = await fetch(`/api/dashboard/cancel-order?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-inbox-key": apiKey },
        body: JSON.stringify({ orderId: order.orderId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setErr(typeof data.error === "string" ? data.error : `Error ${res.status}`); return; }
      if (data.note) window.alert(data.note);
      else if (!data.messaged) window.alert("Order cancelled, but the WhatsApp message did not send (" + (data.messageNote || "unknown") + "). Message the customer manually.");
      onChanged();
    } catch (e: any) { setErr(e?.message || "Failed"); }
    finally { setBusy(""); }
  };

  const showAssign = canAssign(order);
  const showCancel = canCancel(order);
  if (!showAssign && !showCancel) return <span style={{ color: C.sub }}>—</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 160 }}>
      {showAssign && order.courier && (
        <div style={{ fontSize: 11, color: C.sub }}>
          On <b style={{ textTransform: "capitalize", color: C.text }}>{order.courier}</b> — re-create elsewhere:
        </div>
      )}
      {showAssign && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PICKER_COURIERS.map((c) => (
            <button key={c.id} disabled={!!busy} onClick={() => assign(c.id, c.label)} style={assignBtn(c.color)}
              title={`Record order on ${c.label} — no charge`}>
              {busy === c.id ? "…" : `→ ${c.label}`}
            </button>
          ))}
        </div>
      )}
      {/* Rate comparison — read-only, no booking, no wallet charge on ANY courier.
          Shows Velocity / Shiprocket / iThink side by side for this order's pincode,
          weight & payment mode so the operator picks the cheapest, then records +
          ships on that courier. */}
      {/* Edit the ship-to address ONCE here (auto pincode + city/state) so the
          corrected address flows to every courier — no re-typing inside a panel. */}
      {showAssign && (
        <button disabled={!!busy} onClick={() => (addrOpen ? setAddrOpen(false) : openAddr())} style={addrBtn}
          title="Edit the shipping address + pincode once — it fills into whichever courier you ship on">
          {addrOpen ? "✕ Close address" : order.addressEdited ? "✎ Address (edited)" : "✎ Edit address"}
        </button>
      )}
      {showAssign && addrOpen && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, padding: 8, minWidth: 250 }}>
          <div style={{ fontSize: 10.5, color: C.sub, marginBottom: 4 }}>
            Paste the full address (pincode auto-detected; city/state auto-filled from it):
          </div>
          <textarea
            value={addrText}
            onChange={(e) => setAddrText(e.target.value)}
            rows={5}
            placeholder={"Near Bharka Devi Icecream\nChar Rasta, Tankal\nTaluka Chikhli, Navsari, Gujarat – 396560\nIndia"}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 12, padding: 7, borderRadius: 6, border: `1px solid ${C.border}`, resize: "vertical", fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button disabled={busy === "addr"} onClick={saveAddr} style={assignBtn("#0a7d5a")}>
              {busy === "addr" ? "Saving…" : "Save address"}
            </button>
            <button disabled={busy === "addr"} onClick={() => setAddrOpen(false)} style={{ ...assignBtn("#999"), background: "#fff", color: C.sub, border: `1px solid ${C.border}` }}>
              Cancel
            </button>
          </div>
          {addrMsg && <div style={{ color: C.ok, fontSize: 10.5, marginTop: 5 }}>{addrMsg}</div>}
        </div>
      )}
      {showAssign && (
        <button disabled={!!busy} onClick={checkRate} style={rateBtn}
          title="Compare Velocity / Shiprocket / iThink rates for this order — nothing is booked or charged">
          {busy === "rate" ? "Comparing…" : "📊 Compare rates"}
        </button>
      )}
      {rate && <RateCompare rate={rate} busy={busy} onBookIthink={bookIthink} />}
      {/* iThink is booked DIRECTLY from HERE — no "record" step first (its API has
          no draft/New-Orders state). Shows on any pre-shipment order without an AWB.
          This is the ONLY button that books on iThink AND charges the iThink wallet
          (double-confirmed inside bookIthink). */}
      {showAssign && !order.awb && (
        <button disabled={!!busy} onClick={() => bookIthink()} style={assignBtn("#B8860B")}
          title="Books the order on iThink (default courier), generates the AWB and charges your iThink wallet — or use Compare to book a specific courier">
          {busy === "book-ithink" ? "Booking…" : "💸 Book on iThink (default)"}
        </button>
      )}
      {showCancel && (
        <button disabled={!!busy} onClick={cancel} style={cancelBtn} title="Cancel this order and message the customer">
          {busy === "cancel" ? "Cancelling…" : "✕ Cancel order"}
        </button>
      )}
      {err && <div style={{ color: C.bad, fontSize: 11 }}>{err}</div>}
    </div>
  );
}
const cancelBtn: React.CSSProperties = { padding: "5px 9px", borderRadius: 7, border: "1px solid #d9534f", background: "#fff", color: "#c9302c", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", alignSelf: "flex-start" };
const rateBtn: React.CSSProperties = { padding: "5px 9px", borderRadius: 7, border: "1px solid #0a7d5a", background: "#fff", color: "#0a7d5a", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", alignSelf: "flex-start" };
const addrBtn: React.CSSProperties = { padding: "5px 9px", borderRadius: 7, border: "1px solid #b07d2b", background: "#fff", color: "#8a6011", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", alignSelf: "flex-start" };

// Side-by-side rate comparison for one order (Velocity / Shiprocket / iThink).
// The cheapest platform overall is highlighted. Read-only — nothing is booked.
const COURIER_META: Record<string, { label: string; color: string }> = {
  velocity: { label: "Velocity", color: "#6b4a8f" },
  shiprocket: { label: "Shiprocket", color: "#5b3bd4" },
  ithink: { label: "iThink", color: "#0a7d5a" },
};
function RateCompare({ rate, busy, onBookIthink }: { rate: any; busy?: string; onBookIthink?: (logistics: string, serviceType: string) => void }) {
  const couriers: Record<string, any> = rate?.couriers || {};
  const order = ["velocity", "shiprocket", "ithink"];
  // Lowest cheapest-rate across the platforms that returned a quote -> winner.
  const best = order
    .map((k) => ({ k, c: couriers[k]?.cheapest?.rate }))
    .filter((x) => typeof x.c === "number")
    .sort((a, b) => a.c - b.c)[0]?.k;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, padding: "8px 9px", fontSize: 11, color: C.text, minWidth: 250 }}>
      <div style={{ color: C.sub, marginBottom: 6 }}>
        {(rate.paymentMode || "—").toUpperCase()} · {rate.weightKg}kg · box {rate.box}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {order.map((k) => {
          const c = couriers[k] || {};
          const meta = COURIER_META[k];
          const isBest = k === best;
          const cheapest = c?.cheapest;
          return (
            <div key={k} style={{ flex: "1 1 130px", minWidth: 130, border: `1px solid ${isBest ? C.ok : C.border}`, borderRadius: 7, padding: "6px 7px", background: isBest ? "#F0FAF3" : "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <b style={{ color: meta.color }}>{meta.label}</b>
                {isBest && <span style={{ color: C.ok, fontWeight: 700, fontSize: 10 }}>★ cheapest</span>}
              </div>
              {c.ok && cheapest ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.ok }}>₹{cheapest.rate}</div>
                  <div style={{ color: C.sub, fontSize: 10 }}>
                    {cheapest.courier}{cheapest.tat ? ` · ${cheapest.tat}d` : ""}
                  </div>
                  {/* iThink: every option is BOOKABLE straight from here — pick the
                      reliable courier (not always the cheapest) and book that exact
                      one (books + charges the iThink wallet, double-confirmed). */}
                  {k === "ithink" && onBookIthink && Array.isArray(c.rates) && c.rates.length > 0 && (
                    <div style={{ marginTop: 5, borderTop: `1px dashed ${C.border}`, paddingTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                      {c.rates.slice(0, 6).map((r: any, i: number) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 78, fontSize: 10 }} title={`${r.courier}${r.serviceType ? ` (${r.serviceType})` : ""}`}>
                            {r.courier}
                          </span>
                          <span style={{ fontSize: 10, color: C.sub }}>₹{r.rate}</span>
                          <button
                            disabled={!!busy}
                            onClick={() => onBookIthink(r.courier, r.serviceType || "")}
                            title={`Book on iThink via ${r.courier}${r.serviceType ? ` (${r.serviceType})` : ""} — generates AWB + charges wallet`}
                            style={{ padding: "2px 7px", borderRadius: 6, border: "none", background: "#B8860B", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                          >
                            {busy === "book-ithink" ? "…" : "💸 Book"}
                          </button>
                        </div>
                      ))}
                      {c.rates.length > 6 && <div style={{ color: C.sub, fontSize: 10 }}>+{c.rates.length - 6} more…</div>}
                    </div>
                  )}
                  {k !== "ithink" && Array.isArray(c.rates) && c.rates.length > 1 && (
                    <div style={{ marginTop: 4, color: C.sub, fontSize: 10, borderTop: `1px dashed ${C.border}`, paddingTop: 3 }}>
                      {c.rates.slice(0, 4).map((r: any, i: number) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 }}>{r.courier}</span>
                          <span>₹{r.rate}</span>
                        </div>
                      ))}
                      {c.rates.length > 4 && <div>+{c.rates.length - 4} more…</div>}
                    </div>
                  )}
                </>
              ) : c.needsConfig ? (
                <div style={{ color: C.warn, fontSize: 10 }}>Rate endpoint not set up yet.</div>
              ) : (
                <div style={{ color: C.bad, fontSize: 10 }}>{c.error || "no quote"}</div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ color: C.sub, marginTop: 6, fontSize: 10 }}>Quotes only — nothing booked or charged. Pick a courier below to record & ship.</div>
    </div>
  );
}
function assignBtn(bg: string): React.CSSProperties {
  return { padding: "5px 9px", borderRadius: 7, border: "none", background: bg, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };
}

// ===========================================================================
// SHIP QUEUE — pending orders since the backlog, each scored by the carrier
// engine (our-data RTO% + best-3 carriers) and bucketed SHIP / MESSAGE / CALL.
// Stage 1: triage view + one-tap confirm message. Ship/create actions next.
// ===========================================================================
const BUCKET_STYLE: Record<string, { bg: string; fg: string }> = {
  SHIP: { bg: "#DCF3E5", fg: "#1E874B" },
  MESSAGE: { bg: "#FFF3D6", fg: "#B8860B" },
  CALL: { bg: "#FBE3E1", fg: "#C0392B" },
};
const isPendingShip = (o: Order) =>
  !(o.awb && !/^MOCK/i.test(o.awb)) &&
  !["cancelled", "on_hold", "delivered", "rto", "dispatched", "out_for_delivery", "created"].includes(o.status) &&
  // A real, shippable order has a customer and a delivery address — this drops
  // ancient empty/orphan rows (old test/failed orders stuck as "new") that have
  // neither and were cluttering the queue.
  !!String(o.name || "").trim() &&
  !!(o.address && (o.address.line1 || o.address.city || o.address.postalCode));
const rtoColor = (p: number | null) =>
  p == null ? C.sub : p > 70 ? C.bad : p >= 50 ? C.warn : C.ok;
const sqBtn = (bg: string): React.CSSProperties => ({
  cursor: "pointer", border: `1px solid ${C.border}`, background: bg, color: C.text,
  borderRadius: 8, padding: "4px 9px", fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap",
});
const field: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box", background: "#fff" };
const lbl: React.CSSProperties = { fontSize: 11, color: C.sub, fontWeight: 600, marginBottom: 3, display: "block" };

// Pick the recommended carrier's Velocity rate from a rate-compare response:
// the first best-for-state carrier that Velocity actually quoted, else cheapest.
function pickCarrierRate(velRates: any[], best: { carrier: string }[]): { carrier: string; rate: number } | null {
  if (!Array.isArray(velRates) || !velRates.length) return null;
  const brandOf = (name: string) => {
    const n = String(name || "").toLowerCase();
    for (const b of ["dtdc", "delhivery", "ekart", "xpressbees", "shadowfax", "bluedart", "amazon"]) if (n.includes(b)) return b;
    return n;
  };
  for (const b of best) {
    const want = b.carrier.toLowerCase();
    const hit = velRates.find((r) => brandOf(r.courier) === want);
    if (hit) return { carrier: hit.courier, rate: Number(hit.rate) || 0 };
  }
  const cheapest = velRates.reduce((a, b) => (b.rate < a.rate ? b : a));
  return { carrier: cheapest.courier, rate: Number(cheapest.rate) || 0 };
}

type ShipModal = { o: Order; r: Reco; loading: boolean; carrier?: string; cost?: number; gst?: number; total?: number; err?: string } | null;
type EditModal = { o: Order; sellingPrice: string; qty: string; colour: string; dCode: string; line1: string; line2: string; city: string; state: string; postalCode: string } | null;

function ShipQueueTab({ orders, loading, apiKey, onChanged }: { orders: Order[]; loading: boolean; apiKey: string; onChanged: () => void }) {
  const [filter, setFilter] = useState<"ALL" | "SHIP" | "MESSAGE" | "CALL">("ALL");
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [shipM, setShipM] = useState<ShipModal>(null);
  const [editM, setEditM] = useState<EditModal>(null);

  const rows = useMemo(() => {
    const list = orders.filter(isPendingShip).map((o) => {
      const r = recoFor(o) as Reco;
      // A confirmed call overrides a high-RTO CALL bucket -> it's ship-ready now.
      if (o.callOutcome === "confirmed" && r.bucket === "CALL") r.bucket = "SHIP";
      return { o, r };
    });
    // Newest order first (descending #), like the Wix order list.
    return list.sort((a, b) => (parseInt(b.o.orderId, 10) || 0) - (parseInt(a.o.orderId, 10) || 0));
  }, [orders]);
  const counts = useMemo(() => {
    const c = { SHIP: 0, MESSAGE: 0, CALL: 0 };
    rows.forEach(({ r }) => { c[r.bucket]++; });
    return c;
  }, [rows]);
  const shown = filter === "ALL" ? rows : rows.filter(({ r }) => r.bucket === filter);

  const sendConfirm = async (orderId: string) => {
    if (!window.confirm(`Send the order-confirmation (YES reply) WhatsApp to #${orderId}?`)) return;
    setBusy((b) => ({ ...b, [orderId]: "sending" }));
    try {
      const res = await fetch("/api/admin/send-confirm-reply", {
        method: "POST", headers: { "Content-Type": "application/json", "x-inbox-key": apiKey },
        body: JSON.stringify({ numbers: [orderId], send: true }),
      });
      const j = await res.json();
      const ok = j?.results?.[0]?.ok;
      setBusy((b) => ({ ...b, [orderId]: ok ? "sent ✓" : `failed: ${j?.results?.[0]?.error || j.error || "err"}` }));
    } catch (e: any) {
      setBusy((b) => ({ ...b, [orderId]: "failed: " + (e?.message || "err") }));
    }
  };

  // CREATE-ONLY on Velocity — no charge, lands in Velocity "New Orders" to ship there.
  const createOnVelocity = async (o: Order) => {
    if (!window.confirm(`Create #${o.orderId} on Velocity (no charge)?\n\nLands in Velocity "New Orders" — nothing is booked or debited; you pick the courier + ship it there.`)) return;
    setBusy((b) => ({ ...b, [o.orderId]: "creating" }));
    try {
      const res = await fetch(`/api/dashboard/assign-courier?key=${encodeURIComponent(apiKey)}`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-inbox-key": apiKey },
        body: JSON.stringify({ orderId: o.orderId, courier: "velocity", ship: false }),
      });
      const j = await res.json();
      setBusy((b) => ({ ...b, [o.orderId]: j.ok ? "created ✓" : `failed: ${j.error || "err"}` }));
      if (j.ok) onChanged();
    } catch (e: any) { setBusy((b) => ({ ...b, [o.orderId]: "failed: " + (e?.message || "err") })); }
  };

  // Open the ship confirm modal and fetch the recommended carrier's live cost + 18% GST.
  const openShip = async (o: Order, r: Reco) => {
    setShipM({ o, r, loading: true });
    try {
      const res = await fetch(`/api/dashboard/rate-compare?key=${encodeURIComponent(apiKey)}`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-inbox-key": apiKey },
        body: JSON.stringify({ orderId: o.orderId }),
      });
      const j = await res.json();
      const vel = j?.couriers?.velocity;
      if (!j.ok || !vel?.ok) { setShipM({ o, r, loading: false, err: vel?.error || j.error || "no Velocity rate" }); return; }
      const pick = pickCarrierRate(vel.rates, r.best);
      if (!pick) { setShipM({ o, r, loading: false, err: "no serviceable carrier" }); return; }
      const cost = Math.round(pick.rate);
      const gst = Math.round(cost * 0.18);
      setShipM({ o, r, loading: false, carrier: pick.carrier, cost, gst, total: cost + gst });
    } catch (e: any) { setShipM({ o, r, loading: false, err: e?.message || "failed" }); }
  };

  // Confirm the ship: book on Velocity (charges wallet + AWB) then persist the
  // quoted delivery cost (incl. 18% GST) on the order for the sales report.
  const confirmShip = async () => {
    if (!shipM || shipM.total == null) return;
    const { o, total } = shipM;
    setBusy((b) => ({ ...b, [o.orderId]: "booking" }));
    setShipM((m) => (m ? { ...m, loading: true } : m));
    try {
      const res = await fetch(`/api/dashboard/assign-courier?key=${encodeURIComponent(apiKey)}`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-inbox-key": apiKey },
        body: JSON.stringify({ orderId: o.orderId, courier: "velocity", ship: true }),
      });
      const j = await res.json();
      if (!j.ok) { setShipM((m) => (m ? { ...m, loading: false, err: j.error || "ship failed" } : m)); setBusy((b) => ({ ...b, [o.orderId]: "failed" })); return; }
      // persist the delivery cost (cost + 18% GST) for the sales report
      await fetch(`/api/dashboard/update-order?key=${encodeURIComponent(apiKey)}`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-inbox-key": apiKey },
        body: JSON.stringify({ orderId: o.orderId, patch: { freight: total } }),
      }).catch(() => {});
      setBusy((b) => ({ ...b, [o.orderId]: "shipped ✓" }));
      setShipM(null); onChanged();
    } catch (e: any) { setShipM((m) => (m ? { ...m, loading: false, err: e?.message || "failed" } : m)); setBusy((b) => ({ ...b, [o.orderId]: "failed" })); }
  };

  const openEdit = (o: Order) => setEditM({
    o, sellingPrice: String(o.sellingPrice ?? ""), qty: String(o.qty ?? 1), colour: o.colour || "", dCode: o.dCode || "",
    line1: o.address?.line1 || "", line2: o.address?.line2 || "", city: o.address?.city || "", state: o.address?.state || "", postalCode: o.address?.postalCode || "",
  });
  const saveEdit = async () => {
    if (!editM) return;
    const { o } = editM;
    setBusy((b) => ({ ...b, [o.orderId]: "saving" }));
    try {
      await fetch(`/api/dashboard/update-order?key=${encodeURIComponent(apiKey)}`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-inbox-key": apiKey },
        body: JSON.stringify({ orderId: o.orderId, patch: { sellingPrice: editM.sellingPrice, qty: editM.qty, colour: editM.colour, dCode: editM.dCode } }),
      });
      await fetch(`/api/dashboard/update-address?key=${encodeURIComponent(apiKey)}`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-inbox-key": apiKey },
        body: JSON.stringify({ orderId: o.orderId, address: { line1: editM.line1, line2: editM.line2, city: editM.city, state: editM.state, postalCode: editM.postalCode } }),
      }).catch(() => {});
      setBusy((b) => ({ ...b, [o.orderId]: "saved ✓" }));
      setEditM(null); onChanged();
    } catch (e: any) { setBusy((b) => ({ ...b, [o.orderId]: "failed: " + (e?.message || "err") })); }
  };

  const topCarriers = Object.entries(engineNational).sort((a, b) => b[1].delPct - a[1].delPct);

  return (
    <div>
      {/* engine summary */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {(["CALL", "SHIP"] as const).map((b) => (
          <button key={b} onClick={() => setFilter(filter === b ? "ALL" : b)}
            style={{ cursor: "pointer", border: `1px solid ${filter === b ? BUCKET_STYLE[b].fg : C.border}`, background: C.card, borderRadius: 12, padding: "10px 16px", textAlign: "left", minWidth: 120 }}>
            <div style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>{b === "CALL" ? "📞 Call first (RTO ≥ 80%)" : "🟢 Ship-ready (< 80%)"}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: BUCKET_STYLE[b].fg }}>{counts[b]}</div>
          </button>
        ))}
        <div style={{ border: `1px solid ${C.border}`, background: C.card, borderRadius: 12, padding: "10px 16px", flex: "1 1 320px" }}>
          <div style={{ fontSize: 12, color: C.sub, fontWeight: 600, marginBottom: 4 }}>Our carrier delivery% (national) · {topCarriers.length} carriers</div>
          <div style={{ fontSize: 12.5, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {topCarriers.map(([c, v]) => (
              <span key={c} title={`${v.del}/${v.res} resolved · carrier-fault ${v.carrierFaultPct}%`}>
                <b>{c}</b> {v.delPct}%{engineFake[c] ? <span style={{ color: C.bad }} title={`${engineFake[c]} orders bounced as non-serviceable at serviceable pincodes`}> ⚠{engineFake[c]}</span> : null}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>⚠ = suspected fake non-serviceable (carrier badmashi). Engine built {engineGeneratedAt ? new Date(engineGeneratedAt).toLocaleDateString("en-IN") : "—"}.</div>
        </div>
      </div>

      <TableWrap>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: C.sub, borderBottom: `2px solid ${C.border}` }}>
              {["Order", "Customer", "Destination", "RTO%", "Action", "Best 3 carriers", "Flags", "Pay", "Address (cleaned)", ""].map((h) => (
                <th key={h} style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} style={{ padding: 16, color: C.sub }}>Loading…</td></tr>}
            {!loading && shown.length === 0 && <tr><td colSpan={10} style={{ padding: 16, color: C.sub }}>No pending orders in this bucket. 🎉</td></tr>}
            {shown.map(({ o, r }) => (
              <tr key={o.orderId} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "8px 10px", fontWeight: 600, whiteSpace: "nowrap" }}>#{o.orderId}</td>
                <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{o.name}<div style={{ color: C.sub, fontSize: 11 }}>{o.phone}</div></td>
                <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{(o.address?.city || "") + ""}<div style={{ color: C.sub, fontSize: 11 }}>{r.state}</div></td>
                <td style={{ padding: "8px 10px", fontWeight: 700, color: rtoColor(r.rtoPct) }}>{r.rtoPct == null ? "?" : r.rtoPct + "%"}<div style={{ color: C.sub, fontSize: 10, fontWeight: 400 }}>n={r.sample}</div></td>
                <td style={{ padding: "8px 10px" }}>
                  <span style={{ background: BUCKET_STYLE[r.bucket].bg, color: BUCKET_STYLE[r.bucket].fg, padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{r.bucket}</span>
                </td>
                <td style={{ padding: "8px 10px" }}>{r.best.length ? r.best.map((b) => `${b.carrier} ${b.adj}%`).join(" · ") : <span style={{ color: C.sub }}>no data</span>}</td>
                <td style={{ padding: "8px 10px" }}>{r.flags.map((f) => <span key={f} style={{ background: "#FBE3E1", color: C.bad, padding: "1px 7px", borderRadius: 6, fontSize: 11, marginRight: 4 }}>{f}</span>)}</td>
                <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{r.payment}</td>
                <td style={{ padding: "8px 10px", maxWidth: 260, fontSize: 12, color: C.sub }} title={r.cleanAddr}>{r.cleanAddr.length > 70 ? r.cleanAddr.slice(0, 70) + "…" : r.cleanAddr}</td>
                <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", maxWidth: 230 }}>
                    {r.payment === "COD" && (
                      <button onClick={() => sendConfirm(o.orderId)} disabled={busy[o.orderId] === "sending"} title="Send YES-reply confirmation WhatsApp"
                        style={sqBtn(busy[o.orderId]?.startsWith("sent") ? "#DCF3E5" : C.card)}>
                        {busy[o.orderId] === "sending" ? "…" : busy[o.orderId]?.startsWith("sent") ? "Sent ✓" : "📩 Confirm"}
                      </button>
                    )}
                    <button onClick={() => openShip(o, r)} disabled={busy[o.orderId] === "booking"} title="Book + generate AWB on Velocity (charges wallet)"
                      style={sqBtn(busy[o.orderId]?.startsWith("shipped") ? "#DCF3E5" : "#FFF3D6")}>🚀 Ship</button>
                    <button onClick={() => createOnVelocity(o)} disabled={busy[o.orderId] === "creating"} title="Create on Velocity (no charge) — ship from its New Orders"
                      style={sqBtn(busy[o.orderId]?.startsWith("created") ? "#DCF3E5" : C.card)}>📦 Create</button>
                    <button onClick={() => openEdit(o)} title="Edit address / product / amount / qty" style={sqBtn(C.card)}>✏️ Edit</button>
                  </div>
                  {busy[o.orderId] && !/sent|shipped|created|saved/.test(busy[o.orderId]) && <div style={{ color: busy[o.orderId].startsWith("failed") ? C.bad : C.sub, fontSize: 10, marginTop: 2 }}>{busy[o.orderId]}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p style={{ color: C.sub, fontSize: 12, marginTop: 10 }}>📩 Confirm sends the YES-reply WhatsApp · 🚀 Ship books + AWB on Velocity (shows cost + 18% GST, charges wallet) · 📦 Create lands in Velocity New Orders (no charge) · ✏️ Edit updates address / product / amount.</p>

      {/* SHIP CONFIRM MODAL — delivery cost + 18% GST, charges wallet on confirm */}
      {shipM && (
        <ModalShell onClose={() => setShipM(null)} title={`🚀 Ship #${shipM.o.orderId} on Velocity`}>
          <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
            <div><b>{shipM.o.name}</b> · {shipM.r.state} · {shipM.r.payment}</div>
            <div style={{ color: C.sub, fontSize: 12 }}>{shipM.r.cleanAddr}</div>
            <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: "10px 0" }} />
            {shipM.loading && <div style={{ color: C.sub }}>Fetching live delivery cost…</div>}
            {shipM.err && <div style={{ color: C.bad }}>⚠ {shipM.err}</div>}
            {!shipM.loading && shipM.total != null && (
              <>
                <div>Recommended carrier: <b>{shipM.carrier}</b></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 2, margin: "8px 0", maxWidth: 280 }}>
                  <span>Delivery cost</span><b style={{ textAlign: "right" }}>{rupee(shipM.cost)}</b>
                  <span>GST (18%)</span><b style={{ textAlign: "right" }}>{rupee(shipM.gst)}</b>
                  <span style={{ borderTop: `1px solid ${C.border}`, paddingTop: 3 }}>Total delivery (saved)</span>
                  <b style={{ textAlign: "right", borderTop: `1px solid ${C.border}`, paddingTop: 3, color: C.plum }}>{rupee(shipM.total)}</b>
                  {shipM.r.payment === "COD" && <><span>COD to collect</span><b style={{ textAlign: "right" }}>{rupee(shipM.o.sellingPrice)}</b></>}
                </div>
                <div style={{ background: "#FBE3E1", color: C.bad, padding: "8px 10px", borderRadius: 8, fontSize: 12.5, margin: "8px 0" }}>
                  ⚠ Booking generates the AWB and <b>debits your Velocity wallet immediately</b> — no undo (cancel in the Velocity panel to refund). Velocity assigns the actual carrier at booking.
                </div>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setShipM(null)} style={sqBtn(C.card)}>Cancel</button>
            <button onClick={confirmShip} disabled={shipM.loading || shipM.total == null}
              style={{ ...sqBtn("#C0392B"), color: "#fff", border: "none", padding: "7px 16px", opacity: shipM.loading || shipM.total == null ? 0.5 : 1 }}>
              {shipM.loading ? "…" : `Confirm & book (${rupee(shipM.total)})`}
            </button>
          </div>
        </ModalShell>
      )}

      {/* EDIT MODAL — address / product / amount / qty */}
      {editM && (
        <ModalShell onClose={() => setEditM(null)} title={`✏️ Edit #${editM.o.orderId}`}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={lbl}>Amount (₹)</label><input style={field} value={editM.sellingPrice} onChange={(e) => setEditM({ ...editM, sellingPrice: e.target.value })} /></div>
            <div><label style={lbl}>Qty</label><input style={field} value={editM.qty} onChange={(e) => setEditM({ ...editM, qty: e.target.value })} /></div>
            <div><label style={lbl}>Colour</label><input style={field} value={editM.colour} onChange={(e) => setEditM({ ...editM, colour: e.target.value })} /></div>
            <div><label style={lbl}>Product (D-code)</label><input style={field} value={editM.dCode} onChange={(e) => setEditM({ ...editM, dCode: e.target.value })} /></div>
            <div style={{ gridColumn: "1 / 3" }}><label style={lbl}>Address line 1</label><input style={field} value={editM.line1} onChange={(e) => setEditM({ ...editM, line1: e.target.value })} /></div>
            <div style={{ gridColumn: "1 / 3" }}><label style={lbl}>Address line 2 / landmark</label><input style={field} value={editM.line2} onChange={(e) => setEditM({ ...editM, line2: e.target.value })} /></div>
            <div><label style={lbl}>City</label><input style={field} value={editM.city} onChange={(e) => setEditM({ ...editM, city: e.target.value })} /></div>
            <div><label style={lbl}>State</label><input style={field} value={editM.state} onChange={(e) => setEditM({ ...editM, state: e.target.value })} /></div>
            <div><label style={lbl}>Pincode</label><input style={field} value={editM.postalCode} onChange={(e) => setEditM({ ...editM, postalCode: e.target.value })} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
            <button onClick={() => setEditM(null)} style={sqBtn(C.card)}>Cancel</button>
            <button onClick={saveEdit} style={{ ...sqBtn(C.plum), color: "#fff", border: "none", padding: "7px 16px" }}>Save</button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,20,16,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, width: "100%", maxWidth: 460, boxShadow: "0 12px 40px rgba(90,10,24,0.18)", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ fontFamily: SERIF, fontSize: 19, color: C.plumDark, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ ...sqBtn(C.card), border: "none", fontSize: 16 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ===========================================================================
// CALL QUEUE — orders to phone the customer about before shipping. Each card
// says WHY (bad phone / broken address / high return area) and WHAT TO ASK, plus
// a phone-reachability check, and an answer form: Confirmed/Cancelled, the correct
// pincode (live-validated to city+state), and a landmark — which, on save, is
// auto-arranged into the order's address so it flows straight to shipping.
// ===========================================================================
type CallReason = { type: string; text: string; pin?: string; pinState?: string; pinCity?: string; claimedState?: string; rtoPct?: number; sample?: number };
type PhoneCheck = { raw: string; national: string; valid: boolean; status: "good" | "weak" | "bad"; text: string; wa: string };
type CallRow = {
  orderId: string; name: string; phone: string; phoneCheck: PhoneCheck;
  product: string; colour: string; qty: number; sellingPrice: number | null; paymentMode: string;
  state: string; city: string; pin: string; pinPlace: { city: string; state: string } | null;
  address: any; line: string; rtoPct: number | null; sample: number;
  best: { carrier: string; adj: number }[]; reasons: CallReason[]; whatToAsk: string[]; priority: number;
};
type CallForm = { outcome: "" | "confirmed" | "cancelled"; pincode: string; landmark: string; addressLine: string; note: string; pinInfo?: { valid: boolean; city: string; state: string } };

const PHONE_STYLE: Record<string, { bg: string; fg: string; icon: string }> = {
  good: { bg: "#DCF3E5", fg: "#1E874B", icon: "✓" },
  weak: { bg: "#FFF3D6", fg: "#B8860B", icon: "?" },
  bad: { bg: "#FBE3E1", fg: "#C0392B", icon: "✕" },
};
const REASON_LABEL: Record<string, string> = {
  "bad-phone": "📵 Phone problem", "pin-mismatch": "📍 Pincode ≠ state", "invalid-pin": "📍 Invalid pincode",
  "no-pin": "📍 No pincode", "address-incomplete": "🏠 Address incomplete", "high-rto": "↩️ High return area",
};

function CallQueueTab({ apiKey, onChanged }: { apiKey: string; onChanged: () => void }) {
  const [rows, setRows] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<Record<string, CallForm>>({});

  const loadQueue = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const res = await fetch(`/api/dashboard/call-queue?key=${encodeURIComponent(apiKey)}`, { headers: { "x-inbox-key": apiKey } });
      const j = await res.json();
      if (!j.ok) { setErr(typeof j.error === "string" ? j.error : "Could not load the call queue."); setRows([]); }
      else setRows(j.rows || []);
    } catch (e: any) { setErr(e?.message || "failed"); }
    setLoading(false);
  }, [apiKey]);
  useEffect(() => { loadQueue(); }, [loadQueue]);

  const f = (id: string): CallForm => form[id] || { outcome: "", pincode: "", landmark: "", addressLine: "", note: "" };
  const setF = (id: string, patch: Partial<CallForm>) => setForm((m) => ({ ...m, [id]: { ...f(id), ...patch } }));

  // Live-validate a pincode as the operator types the one the customer gave.
  const checkPin = async (id: string, pin: string) => {
    const p = pin.replace(/\D/g, "");
    setF(id, { pincode: p, pinInfo: undefined });
    if (p.length !== 6) return;
    try {
      const res = await fetch(`/api/dashboard/pin-lookup?pin=${p}&key=${encodeURIComponent(apiKey)}`, { headers: { "x-inbox-key": apiKey } });
      const j = await res.json();
      setF(id, { pinInfo: { valid: !!j.valid, city: j.city || "", state: j.state || "" } });
    } catch { /* ignore */ }
  };

  const resolve = async (row: CallRow, outcome: "confirmed" | "cancelled") => {
    const st = f(row.orderId);
    if (outcome === "cancelled" && !window.confirm(`Mark #${row.orderId} as CANCELLED? (No WhatsApp is sent.)`)) return;
    setBusy((b) => ({ ...b, [row.orderId]: "saving" }));
    try {
      const res = await fetch(`/api/dashboard/call-resolve?key=${encodeURIComponent(apiKey)}`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-inbox-key": apiKey },
        body: JSON.stringify({ orderId: row.orderId, outcome, pincode: st.pincode, landmark: st.landmark, addressLine: st.addressLine, note: st.note }),
      });
      const j = await res.json();
      if (!j.ok) { setBusy((b) => ({ ...b, [row.orderId]: `failed: ${j.error || "err"}` })); return; }
      setBusy((b) => ({ ...b, [row.orderId]: outcome === "confirmed" ? "confirmed ✓ → Ship Queue" : "cancelled ✓" }));
      setRows((rs) => rs.filter((x) => x.orderId !== row.orderId)); // leaves the queue
      onChanged(); // refresh orders so the Ship Queue reflects it
    } catch (e: any) { setBusy((b) => ({ ...b, [row.orderId]: "failed: " + (e?.message || "err") })); }
  };

  const counts = useMemo(() => {
    const c = { phone: 0, address: 0, rto: 0 };
    rows.forEach((r) => {
      if (r.reasons.some((x) => x.type === "bad-phone")) c.phone++;
      if (r.reasons.some((x) => ["pin-mismatch", "invalid-pin", "no-pin", "thin-address"].includes(x.type))) c.address++;
      if (r.reasons.some((x) => x.type === "high-rto")) c.rto++;
    });
    return c;
  }, [rows]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        {[["📵 Bad phone", counts.phone, C.bad], ["📍 Address to fix", counts.address, C.warn], ["↩️ High-return confirm", counts.rto, C.plum]].map(([label, n, col]) => (
          <div key={label as string} style={{ border: `1px solid ${C.border}`, background: C.card, borderRadius: 12, padding: "10px 16px", minWidth: 130 }}>
            <div style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>{label as string}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: col as string }}>{n as number}</div>
          </div>
        ))}
        <button onClick={loadQueue} style={{ ...sqBtn(C.card), padding: "9px 14px" }}>↻ Refresh</button>
        <div style={{ color: C.sub, fontSize: 12.5, flex: "1 1 220px" }}>
          Phone check = our WhatsApp reachability (delivered / replied / failed) + number format. A strong proxy, not a live telecom check.
        </div>
      </div>

      {loading && <div style={{ color: C.sub, padding: 16 }}>Loading call queue…</div>}
      {err && <div style={{ color: C.bad, padding: 12, background: "#FBE3E1", borderRadius: 10 }}>⚠ {err}</div>}
      {!loading && !err && rows.length === 0 && <div style={{ color: C.sub, padding: 16 }}>Nothing to call right now — every open order has a valid phone + address. 🎉</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((row) => {
          const ph = PHONE_STYLE[row.phoneCheck.status];
          const st = f(row.orderId);
          const isOpen = open[row.orderId];
          const b = busy[row.orderId];
          const done = b && /✓/.test(b);
          return (
            <div key={row.orderId} style={{ border: `1px solid ${C.border}`, background: C.card, borderRadius: 14, padding: 14, opacity: done ? 0.6 : 1 }}>
              {/* header */}
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ minWidth: 220 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>#{row.orderId} · {row.name}</div>
                  <div style={{ color: C.sub, fontSize: 12.5 }}>{row.product}{row.colour ? ` · ${row.colour}` : ""}{row.qty > 1 ? ` · ×${row.qty}` : ""} · {row.paymentMode} {rupee(row.sellingPrice)}</div>
                  <div style={{ color: C.sub, fontSize: 12.5, marginTop: 2 }}>{row.city || "—"}, {row.state || "—"} {row.pin && `· ${row.pin}`}{row.rtoPct != null && <> · <span style={{ color: rtoColor(row.rtoPct), fontWeight: 600 }}>RTO {row.rtoPct}%</span></>}</div>
                </div>
                {/* phone box */}
                <div style={{ background: ph.bg, color: ph.fg, borderRadius: 10, padding: "8px 12px", minWidth: 210 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{ph.icon}</span>
                    <a href={`tel:+91${row.phoneCheck.national || ""}`} style={{ color: ph.fg, textDecoration: "none" }}>
                      {row.phoneCheck.national ? `+91 ${row.phoneCheck.national}` : (row.phone || "no number")}
                    </a>
                    {row.phoneCheck.wa && <a href={`https://wa.me/${row.phoneCheck.wa}`} target="_blank" rel="noreferrer" title="Open WhatsApp chat" style={{ color: ph.fg, fontSize: 12, textDecoration: "underline" }}>wa</a>}
                  </div>
                  <div style={{ fontSize: 11.5, marginTop: 2 }}>{row.phoneCheck.text}</div>
                </div>
              </div>

              {/* reasons */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {row.reasons.map((rz, i) => (
                  <span key={i} title={rz.text} style={{ background: C.cream2, color: C.text, borderRadius: 8, padding: "3px 9px", fontSize: 12, fontWeight: 600 }}>
                    {REASON_LABEL[rz.type] || rz.type}
                  </span>
                ))}
              </div>
              {/* why + what to ask */}
              <div style={{ marginTop: 8, fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
                {row.reasons.map((rz, i) => <div key={i} style={{ color: C.sub }}>• {rz.text}</div>)}
                <div style={{ marginTop: 6, fontWeight: 700, color: C.plumDark }}>Ask on the call:</div>
                {row.whatToAsk.map((q, i) => <div key={i}>— {q}</div>)}
              </div>

              {/* answer toggle */}
              {!done && (
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => setOpen((o) => ({ ...o, [row.orderId]: !isOpen }))} style={{ ...sqBtn(isOpen ? C.cream2 : "#FFF3D6"), padding: "6px 14px", fontSize: 13 }}>
                    {isOpen ? "▲ Hide answer" : "📝 Write answer"}
                  </button>
                </div>
              )}

              {/* answer form */}
              {isOpen && !done && (
                <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12, display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={lbl}>Correct pincode (if changed)</label>
                      <input style={field} inputMode="numeric" maxLength={6} placeholder={row.pin || "6-digit pincode"} value={st.pincode} onChange={(e) => checkPin(row.orderId, e.target.value)} />
                      {st.pincode.length === 6 && st.pinInfo && (
                        <div style={{ fontSize: 11.5, marginTop: 3, color: st.pinInfo.valid ? C.ok : C.bad }}>
                          {st.pinInfo.valid ? `✓ ${st.pinInfo.city}, ${st.pinInfo.state}` : "✕ invalid pincode"}
                        </div>
                      )}
                      {row.pin && row.pinPlace && (
                        <div style={{ fontSize: 11, marginTop: 2, color: C.sub }}>current {row.pin} = {row.pinPlace.city}, {row.pinPlace.state}</div>
                      )}
                    </div>
                    <div>
                      <label style={lbl}>Landmark</label>
                      <input style={field} placeholder="e.g. near Shiv Mandir" value={st.landmark} onChange={(e) => setF(row.orderId, { landmark: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Full address line (optional — overwrite if the whole line was wrong)</label>
                    <input style={field} placeholder={row.line || "house / building, street, area"} value={st.addressLine} onChange={(e) => setF(row.orderId, { addressLine: e.target.value })} />
                  </div>
                  <div>
                    <label style={lbl}>Note (optional)</label>
                    <input style={field} placeholder="anything the customer said" value={st.note} onChange={(e) => setF(row.orderId, { note: e.target.value })} />
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => resolve(row, "confirmed")} disabled={b === "saving"} style={{ ...sqBtn("#1E874B"), color: "#fff", border: "none", padding: "8px 18px", fontSize: 13 }}>
                      {b === "saving" ? "Saving…" : "✓ Confirmed — save & send to Ship Queue"}
                    </button>
                    <button onClick={() => resolve(row, "cancelled")} disabled={b === "saving"} style={{ ...sqBtn("#C0392B"), color: "#fff", border: "none", padding: "8px 18px", fontSize: 13 }}>
                      ✕ Cancelled
                    </button>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.sub }}>Confirmed saves the corrected pincode/landmark into the address automatically (city + state auto-filled from the pincode) and moves the order to the Ship Queue. Cancelled is silent — no WhatsApp.</div>
                </div>
              )}
              {b && <div style={{ marginTop: 8, fontSize: 12, color: b.startsWith("failed") ? C.bad : C.ok, fontWeight: 600 }}>{b}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
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
                <td style={{ ...td, textTransform: "capitalize" }}>
                  {o.courier || "—"}
                  {o.courierService && o.courierService.toLowerCase() !== (o.courier || "").toLowerCase() && (
                    <div style={{ color: C.sub, fontSize: 11 }}>via {o.courierService}</div>
                  )}
                </td>
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
