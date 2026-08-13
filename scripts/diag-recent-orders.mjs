// Diagnostic: list recent Wix orders with the fields the Velocity webhook needs
// to message a customer (number, GUID, name, phone, fulfillment status).
//
//   node --env-file=.env.local scripts/diag-recent-orders.mjs [--limit=30]
//
// If today's delivered orders (e.g. Mohit Singh Chambial / Subhas Maity) show up
// here with a valid number + phone, they ARE correlatable — meaning the webhook
// correlation (order_external_id) or the webhook firing is the gap, NOT "no Wix
// order". If they DON'T appear, they're Velocity-only orders our system can't message.

import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { orders } from "@wix/ecom";

const { WIX_API_KEY, WIX_SITE_ID, WIX_ACCOUNT_ID } = process.env;
if (!WIX_API_KEY || (!WIX_SITE_ID && !WIX_ACCOUNT_ID)) {
  console.error("Missing WIX_API_KEY / WIX_SITE_ID (or WIX_ACCOUNT_ID).");
  process.exit(1);
}

const LIMIT = (() => {
  const raw = process.argv.slice(2).find((a) => a.startsWith("--limit="));
  return raw ? Math.max(1, parseInt(raw.split("=")[1], 10) || 30) : 30;
})();

const client = createClient({
  modules: { orders },
  auth: ApiKeyStrategy({
    apiKey: WIX_API_KEY,
    ...(WIX_SITE_ID ? { siteId: WIX_SITE_ID } : { accountId: WIX_ACCOUNT_ID }),
  }),
});

const res = await client.orders.searchOrders({
  cursorPaging: { limit: LIMIT },
  sort: [{ fieldName: "_createdDate", order: "DESC" }],
});

const rows = res?.orders || [];
console.log(`Fetched ${rows.length} recent order(s).\n`);

for (const o of rows) {
  const number = o.number ?? "?";
  const guid = o._id ?? "?";
  const buyer = o.buyerInfo || {};
  const billing = o.billingInfo?.contactDetails || {};
  const shipping = o.shippingInfo?.logistics?.shippingDestination?.contactDetails || {};
  const name =
    [billing.firstName || shipping.firstName, billing.lastName || shipping.lastName].filter(Boolean).join(" ") ||
    buyer.email ||
    "?";
  const phone = billing.phone || shipping.phone || buyer.phone || "-";
  const fulfil = o.fulfillmentStatus || "-";
  const created = o._createdDate ? new Date(o._createdDate).toISOString().slice(0, 10) : "-";
  console.log(`#${number}  ${created}  ${fulfil.padEnd(16)}  ${String(name).padEnd(26)}  ${phone}`);
  console.log(`     guid=${guid}`);
}
