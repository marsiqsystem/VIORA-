import nodemailer from "nodemailer";
import type { SendMailOptions, Transporter } from "nodemailer";

// Single source of truth for outgoing mail. Every route/helper that sends email
// (order confirmation, contact, exchange, newsletter) goes through here so the
// provider is configured in exactly one place.
//
// Primary: Titan SMTP (our own domain, mail@viorajewel.in) via MAIL_* env vars.
// Sending from the domain — with SPF/DKIM/DMARC set in DNS — is what keeps mail
// out of spam, unlike sending from a personal Gmail.
//
// Fallback: the legacy personal Gmail (GMAIL_*). It is a *runtime* fallback,
// not just a config-time one: if Titan is configured but the send fails (bad
// password, host down, quota), we immediately retry through Gmail. A dropped
// order-confirmation email is worse than one sent from the old address.

const MAIL_HOST = process.env.MAIL_HOST;
const MAIL_PORT = Number(process.env.MAIL_PORT || 465);
const MAIL_USER = process.env.MAIL_USER;
const MAIL_PASS = process.env.MAIL_PASS;

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const FROM_NAME = "Viora Jewels";

type Provider = {
  label: string;
  /** The mailbox this provider sends as. The `from` header must match it —
   *  Gmail rejects/rewrites a `from` that isn't its own account. */
  address: string;
  create: () => Transporter;
};

/** Configured providers, in the order they should be tried. */
const providers = (): Provider[] => {
  const list: Provider[] = [];
  if (MAIL_HOST && MAIL_USER && MAIL_PASS) {
    list.push({
      label: "titan",
      address: MAIL_USER,
      create: () =>
        nodemailer.createTransport({
          host: MAIL_HOST,
          port: MAIL_PORT,
          secure: MAIL_PORT === 465, // 465 = implicit TLS; 587 = STARTTLS
          auth: { user: MAIL_USER, pass: MAIL_PASS },
        }),
    });
  }
  if (GMAIL_USER && GMAIL_APP_PASSWORD) {
    list.push({
      label: "gmail",
      address: GMAIL_USER,
      create: () =>
        nodemailer.createTransport({
          service: "gmail",
          auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
        }),
    });
  }
  return list;
};

/** True when at least one mail provider is configured. */
export const isMailConfigured = (): boolean => providers().length > 0;

/** The mailbox address emails are sent from (bare, no display name). */
export const mailFromAddress = (): string | null =>
  providers()[0]?.address ?? null;

export type MailOptions = Omit<SendMailOptions, "from"> & {
  /** Display name in the `from` header. Internal-notification mails pass
   *  e.g. "Viora Jewels Website"; customer-facing mail uses the store name. */
  fromName?: string;
};

/**
 * Sends a message through the first provider that accepts it, and throws only
 * when every configured provider failed. The `from` header is set per provider,
 * so callers must not pass one.
 */
export const sendMail = async (options: MailOptions): Promise<void> => {
  const list = providers();
  if (list.length === 0) {
    throw new Error("Mail is not configured (MAIL_* and GMAIL_* both missing).");
  }

  const { fromName = FROM_NAME, ...message } = options;
  let lastError: unknown;

  for (const provider of list) {
    try {
      await provider
        .create()
        .sendMail({ ...message, from: `"${fromName}" <${provider.address}>` });
      return;
    } catch (err) {
      lastError = err;
      console.error(`Mail send via ${provider.label} failed:`, err);
    }
  }

  throw lastError;
};
