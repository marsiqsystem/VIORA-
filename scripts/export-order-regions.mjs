// Export every Wix order's region (state/city/pincode) + name/phone keyed by
// order number, so the sales Excel (which lacks address) can be joined to region
// for the RTO/cancel/delivery regional report.
//   node --env-file=.env.local scripts/export-order-regions.mjs > order-regions.json
import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { orders } from "@wix/ecom";

const { WIX_API_KEY, WIX_SITE_ID, WIX_ACCOUNT_ID } = process.env;
if (!WIX_API_KEY || (!WIX_SITE_ID && !WIX_ACCOUNT_ID)) {
  console.error("Missing WIX_API_KEY / WIX_SITE_ID."); process.exit(1);
}
const client = createClient({
  modules: { orders },
  auth: ApiKeyStrategy({ apiKey: WIX_API_KEY, ...(WIX_SITE_ID ? { siteId: WIX_SITE_ID } : { accountId: WIX_ACCOUNT_ID }) }),
});

const out = {};
let cursor = null, page = 0, total = 0;
do {
  const req = cursor
    ? { cursorPaging: { limit: 100, cursor } }
    : { cursorPaging: { limit: 100 }, sort: [{ fieldName: "_createdDate", order: "DESC" }] };
  const res = await client.orders.searchOrders(req);
  const rows = res?.orders || [];
  for (const o of rows) {
    const dest = o.shippingInfo?.logistics?.shippingDestination || {};
    const a = dest.address || {};
    const c = dest.contactDetails || {};
    const bill = o.billingInfo?.contactDetails || {};
    const name = [c.firstName || bill.firstName, c.lastName || bill.lastName].filter(Boolean).join(" ").trim();
    out[String(o.number)] = {
      number: o.number,
      state: a.subdivisionFullname || a.subdivision || "",
      city: a.city || "",
      pincode: a.postalCode || "",
      country: a.countryFullname || a.country || "",
      name: name || bill.email || "",
      phone: c.phone || bill.phone || "",
      created: o._createdDate ? new Date(o._createdDate).toISOString().slice(0, 10) : "",
      fulfillmentStatus: o.fulfillmentStatus || "",
      paymentStatus: o.paymentStatus || "",
      total: o.priceSummary?.total?.amount || o.priceSummary?.total?.formattedAmount || "",
    };
    total++;
  }
  cursor = res?.metadata?.cursors?.next || res?.pagingMetadata?.cursors?.next || null;
  page++;
  if (page > 60) break; // safety
} while (cursor);

console.error(`Fetched ${total} orders across ${page} page(s).`);
process.stdout.write(JSON.stringify(out));
