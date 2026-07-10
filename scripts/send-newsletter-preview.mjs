// One-off: send the Viora newsletter welcome preview to a single recipient
// for design approval. Not production-wired yet.
//
// Usage (from VIORA/VIORA):
//   node --env-file=.env.local scripts/send-newsletter-preview.mjs <email>

import nodemailer from "nodemailer";

const { RESEND_API_KEY } = process.env;
const MAIL_FROM = process.env.MAIL_FROM_MARKETING || `"Viora Jewels" <news@viorajewel.in>`;

if (!RESEND_API_KEY) {
  console.error("Missing RESEND_API_KEY (use --env-file=.env.local).");
  process.exit(1);
}

const to = process.argv[2];
if (!to) {
  console.error("Pass a recipient email.");
  process.exit(1);
}

const BRAND = "#9B1B30";
const SITE_URL = "https://viorajewel.in";
const FB_URL = "https://www.facebook.com/people/Viora-Jewels/61589962820647/";
const IG_URL = "https://www.instagram.com/_viorajewels_";

// All images embedded as inline attachments (cid) — most reliable across mail clients.
const FB_PATH = "C:/Users/ASUS/Desktop/VIORA/VIORA/public/facebook.png";
const IG_PATH = "C:/Users/ASUS/Desktop/VIORA/VIORA/public/instagram.png";
const HERO_PATH = "C:/Users/ASUS/Downloads/For our subscriber's.png";

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

const transporter = nodemailer.createTransport({
  host: "smtp.resend.com",
  port: 465,
  secure: true,
  auth: { user: "resend", pass: RESEND_API_KEY },
});

await transporter.sendMail({
  from: MAIL_FROM,
  to,
  subject: "Welcome to Viora 💜",
  html,
  attachments: [
    { filename: "hero.png",     path: HERO_PATH, cid: "subscriber-hero", contentDisposition: "inline" },
    { filename: "facebook.png", path: FB_PATH,   cid: "fb-icon",         contentDisposition: "inline" },
    { filename: "instagram.png",path: IG_PATH,   cid: "ig-icon",         contentDisposition: "inline" },
  ],
});

console.log(`Sent newsletter preview to ${to}`);
