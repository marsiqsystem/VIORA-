// Export Wix Contacts to a name,phone CSV for the WhatsApp Broadcast tool.
//
// Usage (from VIORA/VIORA):
//   node --env-file=.env.local scripts/export-phones-csv.mjs [--out=path.csv] [--cc=91]
//
// Flags:
//   --out=PATH   Where to write the CSV (default: ./viora-whatsapp-contacts.csv)
//   --cc=91      Default country code prepended to bare local numbers (default 91 = India).
//
// Pages through every Wix contact, pulls each phone number, normalizes it to a
// digits-only E.164-ish form (bare 10-digit -> +cc), dedupes by number, and
// writes a header row + name,phone. This is the exact shape /broadcast expects
// (a `name` + `phone` column); the broadcast page re-normalizes and drops any
// invalid/duplicate rows, so a stray bad number can never break a send.

import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { contacts } from "@wix/crm";
import { writeFileSync } from "node:fs";

const { WIX_API_KEY, WIX_SITE_ID, WIX_ACCOUNT_ID } = process.env;

if (!WIX_API_KEY || (!WIX_SITE_ID && !WIX_ACCOUNT_ID)) {
  console.error("Missing WIX_API_KEY / WIX_SITE_ID (or WIX_ACCOUNT_ID). Use --env-file=.env.local.");
  process.exit(1);
}

const args = process.argv.slice(2);
const CC = (() => {
  const raw = args.find((a) => a.startsWith("--cc="));
  return (raw ? raw.split("=")[1] : "91").replace(/[^\d]/g, "") || "91";
})();
const OUT = (() => {
  const raw = args.find((a) => a.startsWith("--out="));
  return raw ? raw.split("=").slice(1).join("=") : "viora-whatsapp-contacts.csv";
})();

// Digits-only, with a default country code for bare 10-digit numbers. Returns
// "" when there's nothing usable. Mirrors the broadcast page's normalizePhone so
// what we write here is exactly what the page will accept.
const normalizePhone = (raw) => {
  let d = String(raw ?? "").replace(/[^\d]/g, "");
  if (!d) return "";
  if (d.length === 10) d = CC + d;                          // 9812345678   -> 919812345678
  else if (d.length === 11 && d.startsWith("0")) d = CC + d.slice(1); // 09812345678 -> 919812345678
  return d;
};
const validPhone = (d) => d.length >= 11 && d.length <= 15;

// Quote a CSV field only when needed (comma, quote, or newline).
const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const client = createClient({
  modules: { contacts },
  auth: ApiKeyStrategy({
    apiKey: WIX_API_KEY,
    ...(WIX_SITE_ID ? { siteId: WIX_SITE_ID } : { accountId: WIX_ACCOUNT_ID }),
  }),
});

// normalizedPhone -> { name, phone }
const byPhone = new Map();
const PAGE_SIZE = 1000;
let offset = 0;
let scanned = 0;
let withPhone = 0;
let invalid = 0;

while (true) {
  const page = await client.contacts.listContacts({ paging: { limit: PAGE_SIZE, offset } });
  const rows = page.contacts || [];
  scanned += rows.length;
  for (const c of rows) {
    const nm = c.info?.name || {};
    const name = [nm.first, nm.last].filter(Boolean).join(" ").trim();

    const list = c.info?.phones?.items || [];
    for (const p of list) {
      const raw = p?.phone || p?.e164Phone || p?.formattedPhone || "";
      if (!raw) continue;
      withPhone++;
      const norm = normalizePhone(raw);
      if (!validPhone(norm)) { invalid++; continue; }
      if (!byPhone.has(norm)) {
        byPhone.set(norm, { name: name || "Customer", phone: norm });
      } else if (name && byPhone.get(norm).name === "Customer") {
        // Fill in a real name if a later contact for the same number has one.
        byPhone.get(norm).name = name;
      }
    }
  }
  if (rows.length < PAGE_SIZE) break;
  offset += PAGE_SIZE;
}

const records = Array.from(byPhone.values());
const lines = ["name,phone", ...records.map((r) => `${csvCell(r.name)},${csvCell(r.phone)}`)];
writeFileSync(OUT, lines.join("\n") + "\n", "utf8");

console.log(`Scanned ${scanned} contact(s); ${withPhone} phone entr(ies) seen, ${invalid} unusable.`);
console.log(`Wrote ${records.length} unique WhatsApp number(s) to ${OUT}`);
