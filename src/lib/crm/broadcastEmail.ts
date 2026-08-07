// Email BROADCAST renderer — the email twin of the WhatsApp broadcast.
//
// Unlike the WhatsApp side there is NO template-approval step: the admin types
// a message + footer, uploads one hero image, and we wrap it in Viora's branded
// newsletter shell (same look as src/lib/newsletterEmail.ts — logo on top,
// image, body, optional button, then address + Instagram/Facebook footer).
//
// Only the image and the text change between sends; everything else is fixed
// brand chrome so every blast looks like it came from Viora.

const BRAND = "#9B1B30"; // ruby
const GOLD = "#A9844C"; // champagne gold
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://viorajewel.in").replace(/\/$/, "");

const FB_URL = "https://www.facebook.com/people/Viora-Jewels/61589962820647/";
const IG_URL = "https://www.instagram.com/_viorajewels_";
const ADDRESS = "38C B.T. Road (Kalpana Apartment), 1st Floor, Flat - 1A Kolkata - 700 056, India.";

// CID names for the inline attachments the API wires up.
export const LOGO_CID = "viora-logo";
export const HERO_CID = "broadcast-hero";
export const FB_CID = "fb-icon";
export const IG_CID = "ig-icon";

/** Escape user text so a stray < or & can't break the email HTML. */
const esc = (s: string): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Insert the customer's first name wherever the admin wrote {name} (also
 * accepts {{name}} / {NAME}). Falls back to a neutral word when the CSV row
 * has no name, so a message never reads "Hi ,".
 */
export const personalize = (text: string, name: string, fallback = "there"): string => {
  const first = String(name || "").trim().split(/\s+/)[0] || fallback;
  return String(text ?? "").replace(/\{\{?\s*name\s*\}?\}/gi, first);
};

/** Turn a plain-text message into safe HTML paragraphs (blank line = new para). */
const bodyToHtml = (message: string): string => {
  const blocks = String(message || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (!blocks.length) return "";
  return blocks
    .map(
      (b) =>
        `<p style="margin:0 0 14px;color:#1A1410;font-size:15px;line-height:1.7;">${esc(
          b
        ).replace(/\n/g, "<br/>")}</p>`
    )
    .join("\n");
};

export type BroadcastEmailInput = {
  /** Personalised message body (plain text; {name} already substituted). */
  message: string;
  /** Optional short footer line shown above the address block. */
  footer?: string;
  /** Optional call-to-action button. */
  buttonLabel?: string;
  buttonUrl?: string;
  /** Whether a hero image is attached (cid:broadcast-hero). */
  hasImage?: boolean;
};

/** Renders one recipient's email HTML in Viora's branded shell. */
export const renderBroadcastEmail = (input: BroadcastEmailInput): string => {
  const { message, footer, buttonLabel, buttonUrl, hasImage } = input;

  const heroBlock = hasImage
    ? `
      <div style="padding:14px 16px 4px;text-align:center;">
        <img src="cid:${HERO_CID}" alt="Viora" style="display:block;width:100%;max-width:600px;height:auto;border-radius:10px;margin:0 auto;" />
      </div>`
    : "";

  const label = String(buttonLabel || "").trim();
  const url = String(buttonUrl || "").trim();
  const buttonBlock =
    label && url
      ? `
      <div style="text-align:center;margin:24px 0 32px;">
        <a href="${esc(url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:14px 44px;border-radius:999px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;letter-spacing:.5px;">${esc(
          label
        )}</a>
      </div>`
      : "";

  const footerLine = String(footer || "").trim()
    ? `<div style="margin-bottom:14px;color:#1A1410;font-size:13px;">${esc(footer!.trim()).replace(
        /\n/g,
        "<br/>"
      )}</div>`
    : "";

  return `
<div style="background:#f4efec;padding:36px 0 24px;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:640px;margin:0 auto;">
    <div style="background:#ffffff;border:5px solid ${BRAND};border-radius:14px;overflow:hidden;color:#1A1410;padding-top:22px;">

      <div style="text-align:center;padding:0 16px 6px;">
        <img src="cid:${LOGO_CID}" alt="Viora Jewels" style="display:inline-block;height:52px;width:auto;" />
      </div>
      <div style="width:60px;height:2px;background:${GOLD};margin:8px auto 4px;"></div>
${heroBlock}
      <div style="padding:22px 34px 6px;">
${bodyToHtml(message)}
      </div>
${buttonBlock}
      <div style="background:#f4eeeb;padding:22px 24px;text-align:center;color:#5c534d;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;border-top:1px solid #ecdfd9;">
${footerLine}
        <div style="margin-bottom:14px;">${ADDRESS}</div>

        <div style="margin:12px 0 14px;">
          <a href="${FB_URL}" style="display:inline-block;margin:0 8px;text-decoration:none;vertical-align:middle;">
            <img src="cid:${FB_CID}" alt="Facebook" width="34" height="34" style="display:inline-block;" />
          </a>
          <a href="${IG_URL}" style="display:inline-block;margin:0 8px;text-decoration:none;vertical-align:middle;">
            <img src="cid:${IG_CID}" alt="Instagram" width="34" height="34" style="display:inline-block;" />
          </a>
          <a href="${SITE_URL}" style="display:inline-block;margin:0 8px;color:#1A1410;text-decoration:none;font-size:24px;line-height:34px;vertical-align:middle;">&#127760;</a>
        </div>

        <p style="margin:14px 0 0;color:#7a6f68;font-size:12px;line-height:1.6;">
          You are receiving this because you are a valued Viora Jewels customer.
        </p>
      </div>
    </div>
  </div>
</div>`;
};

/** Plain-text fallback for clients that don't render HTML. */
export const renderBroadcastText = (message: string, footer?: string): string => {
  const parts = [String(message || "").trim()];
  if (footer && footer.trim()) parts.push("", footer.trim());
  parts.push("", "— Team Viora", SITE_URL);
  return parts.join("\n");
};
