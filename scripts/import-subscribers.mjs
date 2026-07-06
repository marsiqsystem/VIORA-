// One-off: backfill historical newsletter subscribers into Wix Contacts,
// labelled "Newsletter Subscriber", so send-newsletter-blast.mjs can find them.
//
// Prepare a plain text file (one email per line, comments with # allowed):
//   scripts/subscribers.txt
//
// Then run (from VIORA/VIORA):
//   node --env-file=.env.local scripts/import-subscribers.mjs scripts/subscribers.txt
//
// Idempotent: if a contact already exists, we still ensure the label is applied.

import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { contacts, labels } from "@wix/crm";
import { readFileSync } from "node:fs";

const {
  WIX_API_KEY,
  WIX_SITE_ID,
  WIX_ACCOUNT_ID,
} = process.env;

if (!WIX_API_KEY || (!WIX_SITE_ID && !WIX_ACCOUNT_ID)) {
  console.error("Missing WIX_API_KEY / WIX_SITE_ID. Use --env-file=.env.local.");
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node --env-file=.env.local scripts/import-subscribers.mjs <path-to-list.txt>");
  process.exit(1);
}

const NEWSLETTER_LABEL_KEY = "custom.newsletter-subscriber";
const NEWSLETTER_LABEL_NAME = "Newsletter Subscriber";

const raw = readFileSync(file, "utf8");
const emails = Array.from(
  new Set(
    raw
      .split(/\r?\n/)
      .map((l) => l.split("#")[0].trim())
      .filter((l) => /^\S+@\S+\.\S+$/.test(l))
      .map((l) => l.toLowerCase())
  )
);

console.log(`Loaded ${emails.length} unique valid emails from ${file}.`);
if (!emails.length) process.exit(0);

const client = createClient({
  modules: { contacts, labels },
  auth: ApiKeyStrategy({
    apiKey: WIX_API_KEY,
    ...(WIX_SITE_ID ? { siteId: WIX_SITE_ID } : { accountId: WIX_ACCOUNT_ID }),
  }),
});

const labelRes = await client.labels.findOrCreateLabel(NEWSLETTER_LABEL_NAME);
const labelKey = labelRes.label?.key || NEWSLETTER_LABEL_KEY;

let created = 0;
let labelled = 0;
let failed = 0;

for (const email of emails) {
  try {
    let contactId;
    try {
      const res = await client.contacts.createContact({
        emails: { items: [{ email }] },
      });
      contactId = res?.contact?._id;
      if (contactId) created++;
    } catch (err) {
      // Likely already exists — fall through to query.
    }

    if (!contactId) {
      const q = await client.contacts
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

    await client.contacts.labelContact(contactId, [labelKey]);
    labelled++;
    console.log(`ok -> ${email} (${contactId})`);
  } catch (err) {
    failed++;
    console.error(`FAILED -> ${email}: ${err?.message || err}`);
  }
}

console.log(`\nDone. created=${created} labelled=${labelled} failed=${failed}`);
