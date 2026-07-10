// Send the Viora newsletter to every contact labelled "Newsletter Subscriber"
// in Wix Contacts.
//
// Usage (from VIORA/VIORA):
//   node --env-file=.env.local scripts/send-newsletter-blast.mjs [--dry-run] [--limit=N]
//
// Flags:
//   --dry-run   Fetch + print the list, but don't send.
//   --limit=N   Cap the number of sends (useful for a small test batch first).
//
// The HTML is intentionally kept in sync with src/lib/newsletterEmail.ts.
// If you change one, change the other.
//
// Sends through Resend (SMTP) from our marketing identity news@viorajewel.in,
// kept separate from the transactional orders@ identity so a marketing
// complaint can never throttle order-confirmation delivery. Paces at 4
// seconds/message and stops on rate-limit errors.

import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { contacts, labels } from "@wix/crm";
import nodemailer from "nodemailer";

const {
  WIX_API_KEY,
  WIX_SITE_ID,
  WIX_ACCOUNT_ID,
  RESEND_API_KEY,
  NEXT_PUBLIC_SITE_URL,
} = process.env;

const MAIL_FROM = process.env.MAIL_FROM_MARKETING || `"Viora Jewels" <news@viorajewel.in>`;

if (!WIX_API_KEY || (!WIX_SITE_ID && !WIX_ACCOUNT_ID)) {
  console.error("Missing WIX_API_KEY / WIX_SITE_ID (or WIX_ACCOUNT_ID). Use --env-file=.env.local.");
  process.exit(1);
}
if (!RESEND_API_KEY) {
  console.error("Missing RESEND_API_KEY.");
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = (() => {
  const raw = args.find((a) => a.startsWith("--limit="));
  return raw ? Math.max(0, parseInt(raw.split("=")[1], 10) || 0) : Infinity;
})();

// Same pragmatic validation as src/lib/validateEmail.ts (kept inline because
// this is a standalone .mjs script). Rejects obviously-broken addresses BEFORE
// sending, so we don't burn Gmail's daily quota on guaranteed bounces.
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

const NEWSLETTER_LABEL_KEY = "custom.newsletter-subscriber";
const NEWSLETTER_LABEL_NAME = "Newsletter Subscriber";

// Shared with src/lib/newsletterContacts.ts. A contact carrying this label has
// already received this welcome email — from an earlier blast run or from the
// automatic welcome at signup — and must be skipped. Re-running this script is
// therefore safe: it only ever mails people who have never been mailed.
const WELCOME_SENT_LABEL_KEY = "custom.welcome-email-sent";
const WELCOME_SENT_LABEL_NAME = "Welcome Email Sent";
const BRAND = "#9B1B30";
const SITE_URL = (NEXT_PUBLIC_SITE_URL || "https://viorajewel.in").replace(/\/$/, "");
const FB_URL = "https://www.facebook.com/people/Viora-Jewels/61589962820647/";
const IG_URL = "https://www.instagram.com/_viorajewels_";

// Inline attachments — most reliable across mail clients regardless of
// whether /public assets are deployed at the moment of send.
const HERO_PATH = "C:/Users/ASUS/Desktop/VIORA/VIORA/public/newsletter-hero.png";
const FB_PATH = "C:/Users/ASUS/Desktop/VIORA/VIORA/public/facebook.png";
const IG_PATH = "C:/Users/ASUS/Desktop/VIORA/VIORA/public/instagram.png";

const html = `
<div style="background:#f4efec;padding:36px 0 24px;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:640px;margin:0 auto;position:relative;">

    <div style="background:#ffffff;border:5px solid ${BRAND};border-radius:14px;overflow:hidden;color:#1A1410;padding-top:18px;">

      <div style="padding:16px 16px 4px;text-align:center;">
        <img src="cid:subscriber-hero" alt="Welcome to Viora" style="display:block;width:100%;max-width:600px;height:auto;border-radius:10px;margin:0 auto;" />
      </div>

      <div style="padding:26px 34px 8px;">
        <h1 style="margin:0 0 6px;font-size:26px;color:${BRAND};text-align:center;letter-spacing:.5px;">
          Welcome to Viora 💜
        </h1>
        <div style="width:60px;height:2px;background:${BRAND};margin:12px auto 22px;"></div>

        <p style="margin:0 0 14px;color:#1A1410;font-size:15px;line-height:1.7;">Hi there,</p>
        <p style="margin:0 0 14px;color:#1A1410;font-size:15px;line-height:1.7;">Thank you for joining the <strong>Viora</strong> community! We're so happy you're here.</p>
        <p style="margin:0 0 14px;color:#1A1410;font-size:15px;line-height:1.7;">At Viora, we believe beautiful jewelry shouldn't be reserved for special occasions. Whether you're dressing up for a party, heading to work, or simply adding a little sparkle to your everyday look, we've got something made for you.</p>

        <p style="margin:22px 0 10px;color:#1A1410;font-size:15px;line-height:1.7;"><strong>Here's what you can expect from us:</strong></p>
        <ul style="margin:0 0 18px;padding-left:20px;color:#1A1410;font-size:15px;line-height:1.9;">
          <li>✨ New arrivals before anyone else</li>
          <li>💎 Styling ideas and jewelry inspiration</li>
          <li>🎉 Exclusive subscriber-only offers</li>
          <li>❤️ Early access to our biggest launches</li>
        </ul>

        <p style="margin:0 0 14px;color:#1A1410;font-size:15px;line-height:1.7;">As a small thank you for being here, we'd love for you to explore our latest collection and find your next favorite piece.</p>
        <p style="margin:0 0 14px;color:#1A1410;font-size:15px;line-height:1.7;">Thank you for supporting Viora. We can't wait to share what's coming next!</p>

        <p style="margin:22px 0 4px;color:#1A1410;font-size:15px;line-height:1.7;">With love,</p>
        <p style="margin:0;color:${BRAND};font-size:16px;font-weight:bold;">Team Viora</p>
      </div>

      <div style="text-align:center;margin:26px 0 34px;">
        <a href="${SITE_URL}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:14px 44px;border-radius:999px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;letter-spacing:.5px;">ORDER NOW</a>
      </div>

      <div style="background:#f4eeeb;padding:22px 24px;text-align:center;color:#5c534d;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;border-top:1px solid #ecdfd9;">
        <div style="margin-bottom:14px;">38C B.T. Road (Kalpana Apartment), 1st Floor, Flat - 1A Kolkata - 700 056, India.</div>

        <div style="margin:12px 0 14px;">
          <a href="${FB_URL}" style="display:inline-block;margin:0 8px;text-decoration:none;vertical-align:middle;">
            <img src="cid:fb-icon" alt="Facebook" width="34" height="34" style="display:inline-block;" />
          </a>
          <a href="${IG_URL}" style="display:inline-block;margin:0 8px;text-decoration:none;vertical-align:middle;">
            <img src="cid:ig-icon" alt="Instagram" width="34" height="34" style="display:inline-block;" />
          </a>
          <a href="${SITE_URL}" style="display:inline-block;margin:0 8px;color:#1A1410;text-decoration:none;font-size:24px;line-height:34px;vertical-align:middle;">🌐</a>
        </div>

        <p style="margin:14px 0 0;color:#7a6f68;font-size:12px;line-height:1.6;">
          This email was sent to you because you subscribed to the Viora Jewels newsletter.<br/>
          Thank you for being part of our community.
        </p>
      </div>
    </div>
  </div>
</div>`;

// --------------------------------------------------------------------------
// Fetch subscribers from Wix Contacts (by label)
// --------------------------------------------------------------------------
const client = createClient({
  modules: { contacts, labels },
  auth: ApiKeyStrategy({
    apiKey: WIX_API_KEY,
    ...(WIX_SITE_ID ? { siteId: WIX_SITE_ID } : { accountId: WIX_ACCOUNT_ID }),
  }),
});

// Make sure the labels exist (idempotent) so their keys are stable.
const labelRes = await client.labels.findOrCreateLabel(NEWSLETTER_LABEL_NAME);
const labelKey = labelRes.label?.key || NEWSLETTER_LABEL_KEY;
const welcomeRes = await client.labels.findOrCreateLabel(WELCOME_SENT_LABEL_NAME);
const welcomeKey = welcomeRes.label?.key || WELCOME_SENT_LABEL_KEY;

// Wix queryContacts doesn't allow filtering by labelKeys — page through
// listContacts and filter in JS.
//
// Keyed by lowercased email so one address maps to exactly one send, even if
// it appears on several contacts or in several casings.
const byEmail = new Map();
let alreadyWelcomed = 0;
const PAGE_SIZE = 1000;
let offset = 0;
while (true) {
  const page = await client.contacts.listContacts({
    paging: { limit: PAGE_SIZE, offset },
  });
  const rows = page.contacts || [];
  for (const c of rows) {
    const labels = c.info?.labelKeys?.items || [];
    if (!labels.includes(labelKey)) continue;
    // Already got this exact email — never send it a second time.
    if (labels.includes(welcomeKey)) {
      alreadyWelcomed++;
      continue;
    }
    const list = c.info?.emails?.items || [];
    for (const e of list) {
      const email = e?.email?.trim().toLowerCase();
      if (email && !byEmail.has(email)) byEmail.set(email, c._id);
    }
  }
  if (rows.length < PAGE_SIZE) break;
  offset += PAGE_SIZE;
}

// Drop malformed addresses so we never send (and bounce) on them.
const deduped = Array.from(byEmail.keys());
const uniq = deduped.filter(isValidEmail);
const skipped = deduped.filter((e) => !isValidEmail(e));
const target = uniq.slice(0, LIMIT);

console.log(`Found ${deduped.length} un-welcomed subscribers; ${uniq.length} valid, ${skipped.length} skipped as invalid.`);
console.log(`Skipped ${alreadyWelcomed} contact(s) already marked "${WELCOME_SENT_LABEL_NAME}".`);
if (skipped.length) console.log(`Skipped (invalid): ${skipped.join(", ")}`);
if (LIMIT !== Infinity) console.log(`Limiting to first ${LIMIT}.`);
if (DRY_RUN) {
  console.log(target.join("\n"));
  console.log("\n[dry-run] no emails sent.");
  process.exit(0);
}

// --------------------------------------------------------------------------
// Send with pacing
// --------------------------------------------------------------------------
const transporter = nodemailer.createTransport({
  host: "smtp.resend.com",
  port: 465,
  secure: true,
  auth: { user: "resend", pass: RESEND_API_KEY },
});

const attachments = [
  { filename: "hero.png",     path: HERO_PATH, cid: "subscriber-hero", contentDisposition: "inline" },
  { filename: "facebook.png", path: FB_PATH,   cid: "fb-icon",         contentDisposition: "inline" },
  { filename: "instagram.png",path: IG_PATH,   cid: "ig-icon",         contentDisposition: "inline" },
];

let sent = 0;
let failed = 0;
const failures = [];

for (const to of target) {
  try {
    await transporter.sendMail({
      from: MAIL_FROM,
      to,
      subject: "Welcome to Viora 💜",
      html,
      attachments,
    });
    sent++;
    console.log(`[${sent}/${target.length}] sent -> ${to}`);

    // Mark immediately, one address at a time. If the script dies midway, or
    // is simply run again, everyone already mailed is skipped. A failure to
    // label is loud, because it is the only way a duplicate can still happen.
    try {
      await client.contacts.labelContact(byEmail.get(to), [welcomeKey]);
    } catch (labelErr) {
      console.error(
        `WARNING -> ${to} was mailed but could NOT be labelled "${WELCOME_SENT_LABEL_NAME}" ` +
          `(${labelErr?.message || labelErr}). Label it by hand in Wix Contacts, ` +
          `otherwise the next run will email them a second time.`
      );
    }
  } catch (err) {
    failed++;
    failures.push({ to, err: err?.message || String(err) });
    console.error(`FAILED -> ${to}: ${err?.message || err}`);
    // Stop on likely rate-limit / auth errors so we don't get the account flagged.
    if (String(err?.message || "").match(/rate|quota|blocked|550|421|4\.7\./i)) {
      console.error("Rate/quota-looking error — stopping to avoid account trip.");
      break;
    }
  }
  // 4s pace — well under Gmail's per-second limit.
  await new Promise((r) => setTimeout(r, 4000));
}

console.log(`\nDone. sent=${sent} failed=${failed}`);
if (failures.length) {
  console.log("Failures:");
  for (const f of failures) console.log(`  ${f.to} — ${f.err}`);
}
