import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

// Single source of truth for outgoing mail. Every route/helper that sends email
// (order confirmation, contact, exchange, newsletter) goes through here so the
// provider is configured in exactly one place.
//
// Primary: Titan SMTP (our own domain, mail@viorajewel.in) via MAIL_* env vars.
// Sending from the domain — with SPF/DKIM/DMARC set in DNS — is what keeps mail
// out of spam, unlike sending from a personal Gmail.
//
// Fallback: the legacy personal Gmail (GMAIL_*). Kept only so nothing breaks
// mid-migration; once Titan is verified in production the GMAIL_* vars can be
// removed and this fallback becomes dead.

const MAIL_HOST = process.env.MAIL_HOST;
const MAIL_PORT = Number(process.env.MAIL_PORT || 465);
const MAIL_USER = process.env.MAIL_USER;
const MAIL_PASS = process.env.MAIL_PASS;

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const FROM_NAME = "Viora Jewels";

/** True when Titan SMTP is fully configured. */
const hasTitan = Boolean(MAIL_HOST && MAIL_USER && MAIL_PASS);

/** The mailbox address emails are sent from (bare, no display name). */
export const mailFromAddress = (): string | null =>
  MAIL_USER || GMAIL_USER || null;

/**
 * The `from` header. Pass a custom display name for internal-notification style
 * mails (e.g. "Viora Jewels Website"); defaults to the store name.
 */
export const mailFrom = (displayName: string = FROM_NAME): string | null => {
  const addr = mailFromAddress();
  return addr ? `"${displayName}" <${addr}>` : null;
};

/**
 * Returns a configured nodemailer transporter, or null when no mail credentials
 * are present. Prefers Titan SMTP; falls back to Gmail during the migration.
 */
export const getTransporter = (): Transporter | null => {
  if (hasTitan) {
    return nodemailer.createTransport({
      host: MAIL_HOST,
      port: MAIL_PORT,
      secure: MAIL_PORT === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user: MAIL_USER!, pass: MAIL_PASS! },
    });
  }
  if (GMAIL_USER && GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
  }
  return null;
};

/** True when at least one mail provider is configured. */
export const isMailConfigured = (): boolean =>
  hasTitan || Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);
