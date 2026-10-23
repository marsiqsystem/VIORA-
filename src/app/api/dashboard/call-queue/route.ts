// Call Queue — the orders an operator should phone the customer about BEFORE we
// ship: either a high-return-rate destination (our-data RTO ≥ 80%) or a broken
// ship-to address (invalid / mismatched / missing pincode, or a too-thin line).
//
//   GET /api/dashboard/call-queue?key=<INBOX_SECRET>  -> { ok, rows: [...] }
//
// Each row carries WHY we're calling (structured `reasons` + a plain `whatToAsk`)
// and the current pincode's resolved place, so the dashboard can show the operator
// exactly what to confirm. Address verification uses the cached India Post lookup
// (free), so repeat loads are fast. Read-only — ships / charges nothing.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest, normPhone, getReachability } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";
import { lookupPincode } from "@/lib/crm/pincode";
import { fullState, stateRTO, best3 } from "@/lib/crm/carrierEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Only phone about recent, still-open orders. (Boss rule: we work the last ~2
// weeks, i.e. #10851+.) Keeps the India Post verification bounded too.
const MIN_ORDER_NO = 10851;

type AnyOrder = any;

const isPendingShip = (o: AnyOrder) =>
  !(o.awb && !/^MOCK/i.test(o.awb)) &&
  !["cancelled", "on_hold", "delivered", "rto", "dispatched", "out_for_delivery", "created"].includes(o.status) &&
  !!String(o.name || "").trim() &&
  !!(o.address && (o.address.line1 || o.address.city || o.address.postalCode));

const pinOf = (a: any) => String(a?.postalCode || "").match(/\d{6}/)?.[0] || "";
const lineOf = (a: any) => [a?.line1, a?.line2, a?.line3].filter(Boolean).join(" ").trim();

// Offline validity check for an Indian mobile number: must reduce to 10 digits
// starting 6–9 (after stripping a 91/0 prefix). Flags obviously-fake runs like
// all-same or a plain 123456789x sequence. This catches the "number itself is
// wrong" case the operator can't afford to find out only after dialling.
function checkPhone(raw: string): { valid: boolean; national: string; issue: string } {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (!d) return { valid: false, national: "", issue: "no phone number on order" };
  if (d.length !== 10) return { valid: false, national: d, issue: `${d.length} digits (need 10)` };
  if (!/^[6-9]/.test(d)) return { valid: false, national: d, issue: `starts with ${d[0]} (Indian mobiles start 6–9)` };
  if (/^(\d)\1{9}$/.test(d)) return { valid: false, national: d, issue: "all digits the same — looks fake" };
  if (d === "1234567890" || d === "0123456789") return { valid: false, national: d, issue: "sequential digits — looks fake" };
  return { valid: true, national: d, issue: "" };
}

export async function GET(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { orders } = await ordersStore.listOrders({ limit: 3000 });
  const candidates = orders.filter(
    (o: AnyOrder) =>
      isPendingShip(o) &&
      !/prepaid/i.test(String(o.paymentMode || "")) && // prepaid always ships, never call
      (parseInt(o.orderId, 10) || 0) >= MIN_ORDER_NO &&
      o.callOutcome !== "confirmed" && // resolved ones leave the queue
      o.callOutcome !== "cancelled"
  );

  // Verify pincodes in parallel batches (cached in KV, so fast after the first pass).
  const rows: any[] = [];
  const BATCH = 12;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const slice = candidates.slice(i, i + BATCH);
    const done = await Promise.all(
      slice.map(async (o: AnyOrder) => {
        const a = o.address || {};
        const claimedState = fullState(a.state);
        const r = stateRTO(a.state);
        const pin = pinOf(a);
        const line = lineOf(a);
        const reasons: any[] = [];

        // Address checks (India Post).
        let pinPlace: { city: string; state: string } | null = null;
        if (!pin) {
          reasons.push({ type: "no-pin", text: "No 6-digit pincode on the order." });
        } else {
          const looked = await lookupPincode(pin);
          if (!looked.city && !looked.state) {
            reasons.push({ type: "invalid-pin", pin, text: `Pincode ${pin} is invalid / not found.` });
          } else {
            pinPlace = looked;
            const pinState = fullState(looked.state);
            if (claimedState && pinState && pinState !== claimedState) {
              reasons.push({
                type: "pin-mismatch", pin, pinState: looked.state, pinCity: looked.city, claimedState: a.state,
                text: `Pincode ${pin} is ${looked.city}, ${looked.state} — but the order says ${a.state}.`,
              });
            }
          }
        }
        // Only flag an address as INCOMPLETE when, after removing the city / state
        // / pin, there's basically no house/street/locality text left — i.e. a
        // courier could justifiably bounce it. A short-but-real line with a valid
        // pin + city is deliverable (the rider reaches the area + calls), so we do
        // NOT flag it just for being short. (Boss rule: don't flag every address.)
        let strip = line;
        for (const tok of [claimedState, String(a.city || "")].filter((t) => t && t.length > 1)) {
          strip = strip.replace(new RegExp(tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ");
        }
        const meaningful = strip.replace(/\d{6}/g, " ").replace(/[^a-z0-9]/gi, "");
        if (meaningful.length < 4) reasons.push({ type: "address-incomplete", text: `No house / street / locality — only "${line || "—"}".` });

        // High return-rate destination.
        if (r && r.rtoPct >= 80) reasons.push({ type: "high-rto", rtoPct: r.rtoPct, sample: r.res, text: `High return area — ${r.rtoPct}% of our COD orders here came back (n=${r.res}).` });

        // Multi-quantity COD order — bigger money at stake, so confirm before shipping.
        const qty = Number(o.qty) || (Array.isArray(o.items) ? o.items.reduce((s: number, it: any) => s + (Number(it.quantity) || 1), 0) : 1) || 1;
        if (qty > 1) reasons.push({ type: "multi-qty", qty, text: `Multi-quantity order (×${qty}) — higher COD value, confirm the customer wants all ${qty} pieces.` });

        // Phone check: offline validity + WhatsApp reachability (did our messages
        // land / did they ever reply). A bad number is itself a reason to flag.
        const ph = checkPhone(o.phone);
        const reach = await getReachability(o.phone);
        let phoneStatus: "good" | "weak" | "bad";
        let phoneText: string;
        if (!ph.valid) { phoneStatus = "bad"; phoneText = `Number invalid — ${ph.issue}.`; }
        else if (reach.failed) { const et = (reach.lastError as any)?.title; phoneStatus = "bad"; phoneText = `WhatsApp to this number FAILED${et ? ` (${et})` : ""} — verify the number.`; }
        else if (reach.hasInbound) { phoneStatus = "good"; phoneText = "Customer has replied on WhatsApp — number is live."; }
        else if (reach.delivered) { phoneStatus = "good"; phoneText = "Our WhatsApp was delivered/read — number is live."; }
        else if (reach.hasOutbound) { phoneStatus = "weak"; phoneText = "WhatsApp sent but not yet delivered/read — unconfirmed."; }
        else { phoneStatus = "weak"; phoneText = "No WhatsApp history — reachability unconfirmed."; }
        const phone = { raw: o.phone || "", national: ph.national, valid: ph.valid, status: phoneStatus, text: phoneText, wa: normPhone(o.phone) };
        if (phoneStatus === "bad") reasons.push({ type: "bad-phone", text: phoneText });

        if (!reasons.length) return null;

        // What to ask, in priority order.
        const asks: string[] = [];
        if (phoneStatus === "bad") asks.push("FIRST confirm you have the right phone number (ask them to confirm their number).");
        if (reasons.some((x) => x.type === "high-rto")) asks.push("Confirm the customer still wants this COD order (delivery will be attempted).");
        if (reasons.some((x) => x.type === "multi-qty")) asks.push(`Confirm the customer wants all ${qty} pieces (bigger COD — confirm to avoid a costly return).`);
        if (reasons.some((x) => x.type === "pin-mismatch")) asks.push("Confirm the correct pincode (the state and pincode don't match).");
        if (reasons.some((x) => x.type === "invalid-pin" || x.type === "no-pin")) asks.push("Get the correct 6-digit pincode.");
        if (reasons.some((x) => x.type === "address-incomplete")) asks.push("Get the house/building + street + locality (village/area), and a nearby landmark — shop, temple, school or main chowk.");

        const best = best3(a.state).slice(0, 3);
        return {
          orderId: o.orderId, name: o.name, phone: o.phone, phoneCheck: phone,
          product: o.dCode || o.product || "", colour: o.colour || "", qty: o.qty || 1,
          sellingPrice: o.sellingPrice ?? null, paymentMode: o.paymentMode || "COD",
          state: claimedState, city: a.city || "", pin,
          pinPlace, address: a, line,
          rtoPct: r?.rtoPct ?? null, sample: r?.res ?? 0,
          best: best.map((b: any) => ({ carrier: b.carrier, adj: b.adj })),
          reasons, whatToAsk: asks,
          // Order the queue: bad phone first (can't even reach them), then
          // broken address, then plain high-RTO confirmations.
          priority: phoneStatus === "bad" ? 0
            : reasons.some((x) => x.type === "invalid-pin" || x.type === "pin-mismatch" || x.type === "no-pin" || x.type === "address-incomplete") ? 1 : 2,
        };
      })
    );
    for (const d of done) if (d) rows.push(d);
  }

  // Urgent tier first (bad phone -> address -> RTO), then newest order first within
  // each tier (descending #), like the Wix order list.
  rows.sort((a, b) => a.priority - b.priority || (parseInt(b.orderId, 10) || 0) - (parseInt(a.orderId, 10) || 0));
  return NextResponse.json({ ok: true, count: rows.length, rows });
}
