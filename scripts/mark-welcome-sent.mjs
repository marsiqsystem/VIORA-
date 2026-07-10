// One-time backfill: mark every existing "Newsletter Subscriber" in Wix
// Contacts as having already received the welcome email.
//
// Why this exists: the "Welcome Email Sent" label was introduced after the
// first blasts had already gone out, so Wix had no record of who was mailed
// and a re-run would have sent everyone a duplicate. Run this once, before the
// next blast. After that the label maintains itself — /api/subscribe and
// send-newsletter-blast.mjs both write it on every successful send.
//
// Usage (from VIORA/VIORA):
//   node --env-file=.env.local scripts/mark-welcome-sent.mjs --dry-run
//   node --env-file=.env.local scripts/mark-welcome-sent.mjs
//
// Safe to re-run: labelling an already-labelled contact is a no-op.

import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { contacts, labels } from "@wix/crm";

const { WIX_API_KEY, WIX_SITE_ID, WIX_ACCOUNT_ID } = process.env;

if (!WIX_API_KEY || (!WIX_SITE_ID && !WIX_ACCOUNT_ID)) {
  console.error("Missing WIX_API_KEY / WIX_SITE_ID (or WIX_ACCOUNT_ID). Use --env-file=.env.local.");
  process.exit(1);
}

const DRY_RUN = process.argv.slice(2).includes("--dry-run");

// Keep in sync with src/lib/newsletterContacts.ts.
const NEWSLETTER_LABEL_KEY = "custom.newsletter-subscriber";
const NEWSLETTER_LABEL_NAME = "Newsletter Subscriber";
const WELCOME_SENT_LABEL_KEY = "custom.welcome-email-sent";
const WELCOME_SENT_LABEL_NAME = "Welcome Email Sent";

const client = createClient({
  modules: { contacts, labels },
  auth: ApiKeyStrategy({
    apiKey: WIX_API_KEY,
    ...(WIX_SITE_ID ? { siteId: WIX_SITE_ID } : { accountId: WIX_ACCOUNT_ID }),
  }),
});

const subRes = await client.labels.findOrCreateLabel(NEWSLETTER_LABEL_NAME);
const labelKey = subRes.label?.key || NEWSLETTER_LABEL_KEY;
const welcomeRes = await client.labels.findOrCreateLabel(WELCOME_SENT_LABEL_NAME);
const welcomeKey = welcomeRes.label?.key || WELCOME_SENT_LABEL_KEY;

// Page through contacts and collect subscribers not yet marked.
const pending = [];
let already = 0;
const PAGE_SIZE = 1000;
let offset = 0;
while (true) {
  const page = await client.contacts.listContacts({ paging: { limit: PAGE_SIZE, offset } });
  const rows = page.contacts || [];
  for (const c of rows) {
    const keys = c.info?.labelKeys?.items || [];
    if (!keys.includes(labelKey)) continue;
    if (keys.includes(welcomeKey)) {
      already++;
      continue;
    }
    pending.push({ id: c._id, email: c.info?.emails?.items?.[0]?.email || "(no email)" });
  }
  if (rows.length < PAGE_SIZE) break;
  offset += PAGE_SIZE;
}

console.log(`${pending.length} subscriber(s) to mark; ${already} already marked.`);
if (DRY_RUN) {
  for (const p of pending) console.log(`  would mark ${p.email}`);
  console.log("\n[dry-run] nothing written.");
  process.exit(0);
}

let ok = 0;
const failures = [];
for (const p of pending) {
  try {
    await client.contacts.labelContact(p.id, [welcomeKey]);
    ok++;
    console.log(`[${ok}/${pending.length}] marked ${p.email}`);
  } catch (err) {
    failures.push({ email: p.email, err: err?.message || String(err) });
    console.error(`FAILED ${p.email}: ${err?.message || err}`);
  }
}

console.log(`\nDone. marked=${ok} failed=${failures.length}`);
for (const f of failures) console.log(`  ${f.email} — ${f.err}`);
