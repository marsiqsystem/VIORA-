// Diagnostic: dump the @viora/whatsapp extended-fields flags + AWB for orders.
//   node --env-file=.env.local scripts/diag-order-flags.mjs 10207 10204 10194 10180
// Flags like wa_dispatched_sent / wa_wf2_sent / wa_wf3_sent reveal whether the
// Velocity webhook ever fired a status message for the order.

import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { orders } from "@wix/ecom";

const { WIX_API_KEY, WIX_SITE_ID, WIX_ACCOUNT_ID } = process.env;
const NS = "@viora/whatsapp";
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
  const flags = o.extendedFields?.namespaces?.[NS] || {};
  console.log(`#${num}  fulfil=${o.fulfillmentStatus}  guid=${o._id}`);
  console.log(`   flags: ${Object.keys(flags).length ? JSON.stringify(flags) : "(none — no webhook status message ever recorded)"}\n`);
}
