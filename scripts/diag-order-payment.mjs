// Diagnostic: dump the payment-relevant fields of a Wix order by number.
//   node --env-file=.env.local scripts/diag-order-payment.mjs 10228 10227 10225
// Shows priceSummary.total, paymentStatus, balance, buyerNote, and customFields —
// the signals we use to decide PREPAID vs COD + the amount for Velocity.

import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { orders } from "@wix/ecom";

const { WIX_API_KEY, WIX_SITE_ID, WIX_ACCOUNT_ID } = process.env;
const nums = process.argv.slice(2);
if (!nums.length) { console.error("Pass order numbers."); process.exit(1); }

const client = createClient({
  modules: { orders },
  auth: ApiKeyStrategy({ apiKey: WIX_API_KEY, ...(WIX_SITE_ID ? { siteId: WIX_SITE_ID } : { accountId: WIX_ACCOUNT_ID }) }),
});

for (const num of nums) {
  const res = await client.orders.searchOrders({ filter: { number: num }, cursorPaging: { limit: 1 } });
  const o = (res?.orders || [])[0];
  if (!o) { console.log(`#${num}: NOT FOUND\n`); continue; }
  const ps = o.priceSummary || {};
  console.log(`#${num}  guid=${o._id}`);
  console.log(`   paymentStatus   = ${o.paymentStatus}`);
  console.log(`   priceSummary.total = ${JSON.stringify(ps.total)}`);
  console.log(`   priceSummary.subtotal = ${JSON.stringify(ps.subtotal)}  discount=${JSON.stringify(ps.discount)}`);
  console.log(`   balanceSummary  = ${JSON.stringify(o.balanceSummary?.balance)}`);
  console.log(`   buyerNote       = ${JSON.stringify(o.buyerNote)}`);
  console.log(`   customFields    = ${JSON.stringify(o.customFields)}`);
  console.log("");
}
