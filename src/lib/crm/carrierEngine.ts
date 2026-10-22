// Carrier engine helper — turns our shipment-history analysis (baked in
// carrier-engine-data.json, rebuilt by scripts/carrier-engine.mjs from the
// Velocity + Shiprocket exports) into a per-order recommendation the dashboard
// Ship Queue uses: our-data RTO% for the destination state, the best-3 last-mile
// carriers there, an action bucket (SHIP / MESSAGE / CALL), a cleaned address,
// and quality flags. Pure + client-safe (no network).

import DATA from "./carrier-engine-data.json";

type Best = { carrier: string; adj: number; del: number; res: number };
const engine = DATA as {
  generated: string;
  national: Record<string, { delPct: number; del: number; res: number; carrierFaultPct: number }>;
  stateRTO: Record<string, { rtoPct: number; res: number }>;
  bestByState: Record<string, Best[]>;
  fakeNonServiceable: Record<string, number>;
};

// Wix/KV stores state as "IN-UP", a 2-letter code, or a full name — normalise all
// three to the UPPER-CASE full name the engine keys on.
const TWO: Record<string, string> = {
  CT: "CHHATTISGARH", HR: "HARYANA", JK: "JAMMU & KASHMIR", MP: "MADHYA PRADESH", KA: "KARNATAKA",
  MH: "MAHARASHTRA", UP: "UTTAR PRADESH", RJ: "RAJASTHAN", AP: "ANDHRA PRADESH", AS: "ASSAM",
  PB: "PUNJAB", TN: "TAMIL NADU", TG: "TELANGANA", TS: "TELANGANA", WB: "WEST BENGAL", GJ: "GUJARAT",
  BR: "BIHAR", JH: "JHARKHAND", KL: "KERALA", OD: "ODISHA", OR: "ODISHA", UK: "UTTARAKHAND",
  UT: "UTTARAKHAND", HP: "HIMACHAL PRADESH", DL: "DELHI", GA: "GOA", ML: "MEGHALAYA", NL: "NAGALAND",
  AR: "ARUNACHAL PRADESH", MN: "MANIPUR", MZ: "MIZORAM", TR: "TRIPURA", SK: "SIKKIM", CH: "CHANDIGARH",
  AN: "ANDAMAN & NICOBAR", PY: "PUDUCHERRY", DD: "DAMAN & DIU", DN: "DADRA & NAGAR HAVELI", LA: "LADAKH",
};
const ALIAS: Record<string, string> = { CHATTISGARH: "CHHATTISGARH", ORISSA: "ODISHA", PONDICHERRY: "PUDUCHERRY", UTTARANCHAL: "UTTARAKHAND" };

export function fullState(raw?: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const m = s.match(/^IN-([A-Za-z]{2})$/);
  if (m && TWO[m[1].toUpperCase()]) return TWO[m[1].toUpperCase()];
  let x = s.toUpperCase().replace(/^IN-/, "").replace(/\bAND\b/g, "&").replace(/\s+/g, " ");
  if (TWO[x]) return TWO[x];
  return ALIAS[x] || x;
}

export function stateRTO(raw?: string): { rtoPct: number; res: number } | null {
  return engine.stateRTO[fullState(raw)] || null;
}
export function best3(raw?: string): Best[] {
  return engine.bestByState[fullState(raw)] || [];
}
export const national = engine.national;
export const fakeNonServiceable = engine.fakeNonServiceable;
export const generatedAt = engine.generated;

type Addr = { line1?: string; line2?: string; line3?: string; city?: string; state?: string; postalCode?: string; country?: string } | null;

// Rearrange + tidy an address: drop empties & exact-duplicate segments, collapse
// whitespace, Title-Case, append city / state / 6-digit pin once.
export function cleanAddress(a: Addr): string {
  if (!a) return "";
  const title = (s: string) => s.replace(/\s+/g, " ").trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const segs: string[] = [];
  const push = (v?: string) => {
    const t = title(String(v || ""));
    if (t && !segs.some((s) => s.toLowerCase() === t.toLowerCase())) segs.push(t);
  };
  [a.line1, a.line2, a.line3].forEach(push);
  // Append city / state / pin only when the lines don't already contain them,
  // so a line1 that already spells out "…, Bikaner, Rajasthan – 334001" isn't
  // repeated as "…, Bikaner, 334001" on the end.
  const city = title(String(a.city || ""));
  if (city && !segs.join(", ").toLowerCase().includes(city.toLowerCase())) segs.push(city);
  const st = fullState(a.state);
  if (st && !segs.join(" ").toUpperCase().includes(st)) segs.push(st.replace(/\b\w/g, (c) => c.toUpperCase()));
  const pin = String(a.postalCode || "").match(/\d{6}/)?.[0];
  if (pin && !segs.join(" ").includes(pin)) segs.push(pin);
  return segs.join(", ");
}

// Address quality flags.
export function addrFlags(a: Addr): string[] {
  const out: string[] = [];
  const pin = String(a?.postalCode || "").match(/\d{6}/)?.[0];
  if (!pin) out.push("NO-PIN");
  const line = [a?.line1, a?.line2, a?.line3].filter(Boolean).join(" ").trim();
  if (line.length < 12 || /^(near|bus stand|market|chowk|main road)\b/i.test(line)) out.push("THIN");
  return out;
}

export type Bucket = "SHIP" | "MESSAGE" | "CALL";
export type Reco = {
  state: string; rtoPct: number | null; sample: number; best: Best[];
  payment: "COD" | "PREPAID"; bucket: Bucket; flags: string[]; cleanAddr: string;
};

// The per-order recommendation. High RTO (>70%) or thin/bad address + COD → CALL;
// mid RTO (50–70%) → MESSAGE-confirm; low RTO or any PREPAID → SHIP.
export function recommend(o: { paymentMode?: string; address?: Addr }): Reco {
  const st = fullState(o.address?.state);
  const r = engine.stateRTO[st] || null;
  const payment: "COD" | "PREPAID" = /prepaid/i.test(String(o.paymentMode || "")) ? "PREPAID" : "COD";
  const flags = addrFlags(o.address || null);
  // Operating rule (2026-10-22): ship everything under 80% RTO; only call the
  // >=80% ones first. Prepaid always ships. (Chasing confirmation on mid-RTO
  // orders was losing more sales to cancellation than it saved.)
  let bucket: Bucket;
  if (payment === "PREPAID") bucket = "SHIP";
  else if (r != null && r.rtoPct >= 80) bucket = "CALL";
  else bucket = "SHIP";
  return { state: st, rtoPct: r?.rtoPct ?? null, sample: r?.res ?? 0, best: engine.bestByState[st] || [], payment, bucket, flags, cleanAddr: cleanAddress(o.address || null) };
}
