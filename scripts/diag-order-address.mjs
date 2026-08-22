// Diagnostic: dump the full shipping-address structure for a few recent Wix
// orders so we know the exact fields (state/city/pincode) for the regional report.
//   node --env-file=.env.local scripts/diag-order-address.mjs
import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { orders } from "@wix/ecom";

const { WIX_API_KEY, WIX_SITE_ID, WIX_ACCOUNT_ID } = process.env;
const client = createClient({
  modules: { orders },
  auth: ApiKeyStrategy({ apiKey: WIX_API_KEY, ...(WIX_SITE_ID ? { siteId: WIX_SITE_ID } : { accountId: WIX_ACCOUNT_ID }) }),
});

const res = await client.orders.searchOrders({ cursorPaging: { limit: 3 }, sort: [{ fieldName: "_createdDate", order: "DESC" }] });
for (const o of res?.orders || []) {
  const dest = o.shippingInfo?.logistics?.shippingDestination || {};
  console.log("#" + o.number, "=>");
  console.log(JSON.stringify({ address: dest.address, contactDetails: dest.contactDetails }, null, 2));
  console.log("-----");
}
