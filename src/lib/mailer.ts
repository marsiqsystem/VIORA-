import nodemailer, { type Transporter } from "nodemailer";

// Central mail transport for the whole app.
//
// We send through Resend (SMTP) using our own verified domain viorajewel.in —
// NOT a free Gmail account. Free Gmail throttles/flags programmatic senders and
// then rejects ALL outbound mail (error 69585 "Message rejected"), which used
// to silently kill order-confirmation emails whenever a newsletter blast ran.
//
// Setup (one-time, done in the Resend dashboard + your DNS):
//   1. Add the domain viorajewel.in in Resend and add the SPF/DKIM/DMARC DNS
//      records it shows. Wait until it says "Verified".
//   2. Put RESEND_API_KEY in .env.local (local) and in Vercel env (production).
//
// Reputation separation: transactional mail (orders, contact, subscribe) goes
// out as orders@viorajewel.in; marketing (newsletter blast/welcome) as
// news@viorajewel.in. A marketing complaint on the news@ identity can never
// throttle the orders@ identity, so order confirmations always get through.

const FROM_NAME = "Viora Jewels";

export const MAIL_FROM_TRANSACTIONAL =
  process.env.MAIL_FROM_TRANSACTIONAL || `"${FROM_NAME}" <orders@viorajewel.in>`;

export const MAIL_FROM_MARKETING =
  process.env.MAIL_FROM_MARKETING || `"${FROM_NAME}" <news@viorajewel.in>`;

let cached: Transporter | null = null;

/**
 * Returns a shared Resend SMTP transporter, or null if RESEND_API_KEY is not
 * configured (callers log-and-skip so a missing key never crashes a request).
 */
export const getMailer = (): Transporter | null => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (cached) return cached;
  cached = nodemailer.createTransport({
    host: "smtp.resend.com",
    port: 465,
    secure: true,
    auth: { user: "resend", pass: apiKey },
  });
  return cached;
};
