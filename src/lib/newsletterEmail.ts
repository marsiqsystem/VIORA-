import path from "node:path";
import { getTransporter, mailFrom } from "@/lib/mailer";

// Branded welcome/newsletter email — sent from our own Gmail, in Viora's
// format (not a Wix/Mailchimp default). Design was approved 2026-07-06.
//
// Keep in sync with scripts/send-newsletter-preview.mjs and
// scripts/send-newsletter-blast.mjs — the HTML there is a copy of the
// string returned here.

const BRAND = "#9B1B30";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://viorajewel.in").replace(/\/$/, "");

const FB_URL = "https://www.facebook.com/people/Viora-Jewels/61589962820647/";
const IG_URL = "https://www.instagram.com/_viorajewels_";

// Public images live under Next.js /public and are readable at runtime via
// process.cwd() on both local dev and Vercel. Reading them from disk and
// attaching as CID keeps the email reliable regardless of what's currently
// deployed to viorajewel.in.
const publicPath = (name: string) => path.join(process.cwd(), "public", name);

export const renderNewsletterEmail = (): {
  subject: string;
  html: string;
  text: string;
} => {
  const subject = "Welcome to Viora \u{1F49C}";

  const html = `
<div style="background:#f4efec;padding:36px 0 24px;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:640px;margin:0 auto;position:relative;">

    <div style="background:#ffffff;border:5px solid ${BRAND};border-radius:14px;overflow:hidden;color:#1A1410;padding-top:18px;">

      <div style="padding:16px 16px 4px;text-align:center;">
        <img src="cid:subscriber-hero" alt="Welcome to Viora" style="display:block;width:100%;max-width:600px;height:auto;border-radius:10px;margin:0 auto;" />
      </div>

      <div style="padding:26px 34px 8px;">
        <h1 style="margin:0 0 6px;font-size:26px;color:${BRAND};text-align:center;letter-spacing:.5px;">
          Welcome to Viora &#128156;
        </h1>
        <div style="width:60px;height:2px;background:${BRAND};margin:12px auto 22px;"></div>

        <p style="margin:0 0 14px;color:#1A1410;font-size:15px;line-height:1.7;">Hi there,</p>
        <p style="margin:0 0 14px;color:#1A1410;font-size:15px;line-height:1.7;">Thank you for joining the <strong>Viora</strong> community! We're so happy you're here.</p>
        <p style="margin:0 0 14px;color:#1A1410;font-size:15px;line-height:1.7;">At Viora, we believe beautiful jewelry shouldn't be reserved for special occasions. Whether you're dressing up for a party, heading to work, or simply adding a little sparkle to your everyday look, we've got something made for you.</p>

        <p style="margin:22px 0 10px;color:#1A1410;font-size:15px;line-height:1.7;"><strong>Here's what you can expect from us:</strong></p>
        <ul style="margin:0 0 18px;padding-left:20px;color:#1A1410;font-size:15px;line-height:1.9;">
          <li>&#10024; New arrivals before anyone else</li>
          <li>&#128142; Styling ideas and jewelry inspiration</li>
          <li>&#127881; Exclusive subscriber-only offers</li>
          <li>&#10084;&#65039; Early access to our biggest launches</li>
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
          <a href="${SITE_URL}" style="display:inline-block;margin:0 8px;color:#1A1410;text-decoration:none;font-size:24px;line-height:34px;vertical-align:middle;">&#127760;</a>
        </div>

        <p style="margin:14px 0 0;color:#7a6f68;font-size:12px;line-height:1.6;">
          This email was sent to you because you subscribed to the Viora Jewels newsletter.<br/>
          Thank you for being part of our community.
        </p>
      </div>
    </div>
  </div>
</div>`;

  const text = [
    "Welcome to Viora",
    "",
    "Hi there,",
    "Thank you for joining the Viora community! We're so happy you're here.",
    "",
    "At Viora, we believe beautiful jewelry shouldn't be reserved for special occasions.",
    "",
    "Here's what you can expect from us:",
    "- New arrivals before anyone else",
    "- Styling ideas and jewelry inspiration",
    "- Exclusive subscriber-only offers",
    "- Early access to our biggest launches",
    "",
    `Explore our latest collection: ${SITE_URL}`,
    "",
    "With love,",
    "Team Viora",
  ].join("\n");

  return { subject, html, text };
};

/**
 * Sends the welcome newsletter email. Never throws — a failure here must not
 * fail the subscribe request. Returns whether the send succeeded so the caller
 * can log.
 */
export const sendNewsletterEmail = async (to: string): Promise<boolean> => {
  const transporter = getTransporter();
  const from = mailFrom();

  if (!transporter || !from) {
    console.error("Newsletter email skipped: mail not configured (MAIL_* / GMAIL_*).");
    return false;
  }

  const { subject, html, text } = renderNewsletterEmail();

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
      attachments: [
        { filename: "hero.png",      path: publicPath("newsletter-hero.png"), cid: "subscriber-hero", contentDisposition: "inline" },
        { filename: "facebook.png",  path: publicPath("facebook.png"),         cid: "fb-icon",         contentDisposition: "inline" },
        { filename: "instagram.png", path: publicPath("instagram.png"),        cid: "ig-icon",         contentDisposition: "inline" },
      ],
    });
    return true;
  } catch (err) {
    console.error("Newsletter email failed:", err);
    return false;
  }
};
