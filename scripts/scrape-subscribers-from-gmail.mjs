// One-off backfill: scrape historical newsletter subscribers from the
// admin Gmail inbox and push them to Wix Contacts (labelled "Newsletter
// Subscriber") so send-newsletter-blast.mjs picks them up.
//
// Before today, /api/subscribe only sent us an admin notification email
// with subject "New newsletter subscriber" and body containing the
// subscriber's address. Those notifications live in viorajewels6@gmail.com.
// This script logs in via IMAP with the app password, pulls all matching
// messages, extracts the subscriber address, dedupes, and upserts to Wix.
//
// Usage (from VIORA/VIORA):
//   node --env-file=.env.local scripts/scrape-subscribers-from-gmail.mjs [--dry-run]
//
// Flags:
//   --dry-run   Extract + print the list, don't push to Wix.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { contacts, labels } from "@wix/crm";

const {
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  WIX_API_KEY,
  WIX_SITE_ID,
  WIX_ACCOUNT_ID,
} = process.env;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.error("Missing GMAIL_USER / GMAIL_APP_PASSWORD. Use --env-file=.env.local.");
  process.exit(1);
}
if (!WIX_API_KEY || (!WIX_SITE_ID && !WIX_ACCOUNT_ID)) {
  console.error("Missing WIX_API_KEY / WIX_SITE_ID.");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

// --------------------------------------------------------------------------
// 1. Pull the notification emails from Gmail via IMAP
// --------------------------------------------------------------------------
const client = new ImapFlow({
  host: "imap.gmail.com",
  port: 993,
  secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  logger: false,
});

await client.connect();
console.log("Connected to Gmail IMAP as", GMAIL_USER);

const emailAddresses = new Set();

// Search "All Mail" so we don't miss anything archived. Fall back to INBOX if not present.
let mailboxName = "[Gmail]/All Mail";
try {
  await client.mailboxOpen(mailboxName, { readOnly: true });
} catch {
  mailboxName = "INBOX";
  await client.mailboxOpen(mailboxName, { readOnly: true });
}
console.log(`Searching "${mailboxName}" for "New newsletter subscriber" notifications...`);

// Match both the current subject and the exact body pattern our route writes.
const uids = await client.search({ subject: "New newsletter subscriber" }, { uid: true });
console.log(`Found ${uids.length} matching messages.`);

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Ignore addresses that are the sender / our own domain / obvious noise.
const IGNORE_DOMAINS = new Set([
  "viorajewels6@gmail.com",
  "viorajewels@gmail.com",
]);

for await (const msg of client.fetch(uids, { source: true, envelope: true }, { uid: true })) {
  const raw = msg.source;
  if (!raw) continue;
  const parsed = await simpleParser(raw);
  const searchable = [parsed.text || "", parsed.html || ""].join("\n");
  const found = searchable.match(EMAIL_RE) || [];
  for (const e of found) {
    const lower = e.toLowerCase();
    if (IGNORE_DOMAINS.has(lower)) continue;
    // Skip our own admin address in any casing.
    if (lower === GMAIL_USER.toLowerCase()) continue;
    // Skip obvious noise (mailer-daemon, no-reply from Gmail itself, etc.)
    if (/^(mailer-daemon|postmaster|no-?reply)@/.test(lower)) continue;
    if (lower.endsWith("@gmail-smtp-in.l.google.com")) continue;
    // Skip obvious test/placeholder domains.
    if (lower.endsWith("@example.com") || lower.endsWith("@example.org")) continue;
    emailAddresses.add(lower);
  }
}

await client.logout();

const list = Array.from(emailAddresses).sort();
console.log(`\nExtracted ${list.length} unique subscriber addresses:`);
for (const e of list) console.log("  ", e);

if (DRY_RUN) {
  console.log("\n[dry-run] not pushing to Wix.");
  process.exit(0);
}

// --------------------------------------------------------------------------
// 2. Push each to Wix Contacts + label as Newsletter Subscriber
// --------------------------------------------------------------------------
const wix = createClient({
  modules: { contacts, labels },
  auth: ApiKeyStrategy({
    apiKey: WIX_API_KEY,
    ...(WIX_SITE_ID ? { siteId: WIX_SITE_ID } : { accountId: WIX_ACCOUNT_ID }),
  }),
});

const NEWSLETTER_LABEL_NAME = "Newsletter Subscriber";
const labelRes = await wix.labels.findOrCreateLabel(NEWSLETTER_LABEL_NAME);
const labelKey = labelRes.label?.key || "custom.newsletter-subscriber";
console.log(`\nUsing Wix label key: ${labelKey}`);

let created = 0;
let labelled = 0;
let failed = 0;

for (const email of list) {
  try {
    let contactId;
    try {
      const res = await wix.contacts.createContact({ emails: { items: [{ email }] } });
      contactId = res?.contact?._id;
      if (contactId) created++;
    } catch {
      // Likely duplicate — fall through to query.
    }

    if (!contactId) {
      const q = await wix.contacts
        .queryContacts()
        .eq("primaryInfo.email", email)
        .limit(1)
        .find();
      contactId = q.items?.[0]?._id;
    }

    if (!contactId) {
      failed++;
      console.error(`FAILED (no id) -> ${email}`);
      continue;
    }

    await wix.contacts.labelContact(contactId, [labelKey]);
    labelled++;
    console.log(`ok -> ${email} (${contactId})`);
  } catch (err) {
    failed++;
    console.error(`FAILED -> ${email}: ${err?.message || err}`);
  }
}

console.log(`\nDone. created=${created} labelled=${labelled} failed=${failed}`);
