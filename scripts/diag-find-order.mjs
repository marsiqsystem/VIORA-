// Diagnostic: search recent Wix orders for specific customer names.
//   node --env-file=.env.local scripts/diag-find-order.mjs "Mohit" "Subhas" "Rushikesh" "Sriteja"
// Pulls up to 300 recent orders and prints any whose buyer name/email contains a
// query term (case-insensitive). Tells us if the Velocity IQ- orders exist in Wix.

import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { orders } from "@wix/ecom";

const { WIX_API_KEY, WIX_SITE_ID, WIX_ACCOUNT_ID } = process.env;
const terms = process.argv.slice(2).map((t) => t.toLowerCase());
if (!terms.length) { console.error("Pass name terms to search for."); process.exit(1); }

const client = createClient({
  modules: { orders },
  auth: ApiKeyStrategy({ apiKey: WIX_API_KEY, ...(WIX_SITE_ID ? { siteId: WIX_SITE_ID } : { accountId: WIX_ACCOUNT_ID }) }),
});

let cursor = null;
let scanned = 0;
const hits = [];
for (let page = 0; page < 6; page++) {
  const res = await client.orders.searchOrders({
    cursorPaging: cursor ? { limit: 50, cursor } : { limit: 50 },
    sort: [{ fieldName: "_createdDate", order: "DESC" }],
  });
  const rows = res?.orders || [];
  scanned += rows.length;
  for (const o of rows) {
    const b = o.billingInfo?.contactDetails || {};
    const s = o.shippingInfo?.logistics?.shippingDestination?.contactDetails || {};
    const name = [b.firstName || s.firstName, b.lastName || s.lastName].filter(Boolean).join(" ");
    const hay = `${name} ${o.buyerInfo?.email || ""}`.toLowerCase();
    if (terms.some((t) => hay.includes(t))) {
      const created = o._createdDate ? new Date(o._createdDate).toISOString().slice(0, 10) : "-";
      hits.push({ number: o.number, name, phone: b.phone || s.phone || "-", fulfil: o.fulfillmentStatus, created, guid: o._id });
    }
  }
  cursor = res?.metadata?.cursors?.next;
  if (!cursor || rows.length < 50) break;
}

console.log(`Scanned ${scanned} recent orders. Matches: ${hits.length}\n`);
for (const h of hits) console.log(`#${h.number}  ${h.created}  ${h.fulfil}  ${h.name}  ${h.phone}\n     guid=${h.guid}`);
if (!hits.length) console.log("(no Wix order matched — these are NOT website/Wix orders)");
