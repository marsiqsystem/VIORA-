// Export Wix Contacts to a name,email CSV for the Email Broadcast tool.
//
// Usage (from VIORA/VIORA):
//   node --env-file=.env.local scripts/export-contacts-csv.mjs [--out=path.csv] [--subscribers-only]
//
// Flags:
//   --out=PATH           Where to write the CSV (default: ./viora-contacts.csv)
//   --subscribers-only   Only contacts labelled "Newsletter Subscriber".
//
// Pages through every Wix contact, dedupes by lowercased email, and writes a
// header row + name,email. Name = first+last, falling back to the email prefix.

import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { contacts, labels } from "@wix/crm";
import { writeFileSync } from "node:fs";

const { WIX_API_KEY, WIX_SITE_ID, WIX_ACCOUNT_ID } = process.env;

if (!WIX_API_KEY || (!WIX_SITE_ID && !WIX_ACCOUNT_ID)) {
  console.error("Missing WIX_API_KEY / WIX_SITE_ID (or WIX_ACCOUNT_ID). Use --env-file=.env.local.");
  process.exit(1);
}

const args = process.argv.slice(2);
const SUBSCRIBERS_ONLY = args.includes("--subscribers-only");
const OUT = (() => {
  const raw = args.find((a) => a.startsWith("--out="));
  return raw ? raw.split("=").slice(1).join("=") : "viora-contacts.csv";
})();

const NEWSLETTER_LABEL_KEY = "custom.newsletter-subscriber";
const NEWSLETTER_LABEL_NAME = "Newsletter Subscriber";

const isValidEmail = (raw) => {
  const email = (typeof raw === "string" ? raw : "").trim().toLowerCase();
  if (!email || email.length > 254 || /\s/.test(email)) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@") || at === email.length - 1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (
    domain.startsWith(".") || domain.endsWith(".") || domain.startsWith("-") ||
    domain.includes("..") || !/^[a-z0-9.-]+$/.test(domain) || !/\.[a-z]{2,}$/.test(domain)
  ) return false;
  return true;
};

// Quote a CSV field only when needed (comma, quote, or newline).
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const client = createClient({
  modules: { contacts, labels },
  auth: ApiKeyStrategy({
    apiKey: WIX_API_KEY,
    ...(WIX_SITE_ID ? { siteId: WIX_SITE_ID } : { accountId: WIX_ACCOUNT_ID }),
  }),
});

let subLabelKey = NEWSLETTER_LABEL_KEY;
if (SUBSCRIBERS_ONLY) {
  const labelRes = await client.labels.findOrCreateLabel(NEWSLETTER_LABEL_NAME);
  subLabelKey = labelRes.label?.key || NEWSLETTER_LABEL_KEY;
}

// email(lowercased) -> { name, email(original casing) }
const byEmail = new Map();
const PAGE_SIZE = 1000;
let offset = 0;
let scanned = 0;

while (true) {
  const page = await client.contacts.listContacts({ paging: { limit: PAGE_SIZE, offset } });
  const rows = page.contacts || [];
  scanned += rows.length;
  for (const c of rows) {
    const labelKeys = c.info?.labelKeys?.items || [];
    if (SUBSCRIBERS_ONLY && !labelKeys.includes(subLabelKey)) continue;

    const nm = c.info?.name || {};
    const name = [nm.first, nm.last].filter(Boolean).join(" ").trim();

    const list = c.info?.emails?.items || [];
    for (const e of list) {
      const raw = e?.email?.trim();
      const key = raw?.toLowerCase();
      if (!key || !isValidEmail(key)) continue;
      if (!byEmail.has(key)) {
        byEmail.set(key, { name: name || raw.split("@")[0], email: raw });
      } else if (name && !byEmail.get(key).name.includes(" ") && name.includes(" ")) {
        // Prefer a fuller name if we later find one for the same address.
        byEmail.get(key).name = name;
      }
    }
  }
  if (rows.length < PAGE_SIZE) break;
  offset += PAGE_SIZE;
}

const records = Array.from(byEmail.values());
const lines = ["name,email", ...records.map((r) => `${csvCell(r.name)},${csvCell(r.email)}`)];
writeFileSync(OUT, lines.join("\n") + "\n", "utf8");

console.log(`Scanned ${scanned} contact(s)${SUBSCRIBERS_ONLY ? ' (subscribers only)' : ''}.`);
console.log(`Wrote ${records.length} unique email(s) to ${OUT}`);
