import nodemailer from "nodemailer";

// Branded, invoice-style order-confirmation email sent from our own Gmail, so
// the customer sees the correct amount and payment status — unlike Wix's
// automatic email, which always shows the "pay cash to courier" text and
// (before the draft-order discount) the pre-discount total.
//
// To avoid customers receiving two emails, Wix's automatic order confirmation
// email should be turned OFF in the Wix dashboard
// (Settings → Notifications / Automations → "Order confirmation").

const BRAND = "#9B1B30";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://viorajewel.in").replace(/\/$/, "");
const LOGO_URL = `${SITE_URL}/email-logo.png`;
const SUPPORT_EMAIL = "viorajewels6@gmail.com";

type OrderEmailItem = {
  name: string;
  quantity: number;
  /** Optional SKU shown under the product name. */
  sku?: string;
  /** Variant lines, e.g. [{ name: "Color", value: "Blue" }]. */
  options?: { name: string; value: string }[];
  /** Per-unit price as a display string, e.g. "599.00". Optional. */
  unitPrice?: string;
  /** Per-line total as a display string, e.g. "599.00". Optional. */
  lineTotal?: string;
  /** Raw Wix media string (wix:image://…) or an https URL. Optional. */
  image?: string;
};

export type OrderEmailParams = {
  to: string;
  customerName: string;
  orderNumber: string;
  /** Pre-formatted placed-on date, e.g. "27 May 2026". Optional. */
  orderDate?: string;
  paymentMethod: "COD" | "PREPAID";
  /** The amount the customer actually pays (discounted total for prepaid, full total for COD). */
  amount: string;
  razorpayPaymentId?: string;
  items: OrderEmailItem[];
  /** Price breakdown (display strings). Any field may be omitted. */
  summary?: {
    subtotal?: string;
    shipping?: string;
    tax?: string;
    discount?: string;
    total?: string;
  };
  address: {
    line1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  phone?: string;
};

const escapeHtml = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const fmtINR = (amount: string | number | undefined) =>
  amount == null || amount === "" ? "" : `₹${amount}`;

// Wix media strings look like:
//   wix:image://v1/<mediaId>/<filename>#originWidth=W&originHeight=H
// Convert to a scaled static CDN URL that renders in email clients.
const toEmailImage = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (!raw.startsWith("wix:image://")) return undefined;
  const m = raw.match(/^wix:image:\/\/v1\/([^/#?]+)(?:\/([^#?]+))?/);
  if (!m) return undefined;
  const mediaId = m[1];
  const filename = m[2] || "image.jpg";
  return `https://static.wixstatic.com/media/${mediaId}/v1/fill/w_160,h_160,al_c,q_85,enc_auto/${filename}`;
};

/**
 * Builds the order-confirmation email (subject + HTML + plain-text). Pure — no
 * I/O — so it can be unit-tested and previewed without sending.
 */
export const renderOrderEmail = (
  params: OrderEmailParams
): { subject: string; html: string; text: string } => {
  const isPrepaid = params.paymentMethod === "PREPAID";

  const paymentLine = isPrepaid
    ? `Payment received online — <strong>nothing to pay on delivery.</strong>`
    : `Cash on Delivery — please keep <strong>${fmtINR(
        params.amount
      )}</strong> ready to pay the courier on delivery.`;

  const paymentLabel = isPrepaid ? `Paid online (Razorpay)` : `Cash on Delivery`;

  const addressText = [
    params.address.line1,
    params.address.city,
    params.address.state,
    params.address.postalCode,
  ]
    .filter(Boolean)
    .join(", ");

  // ---- Order summary rows (thumbnail + name/SKU/options, qty, line total) ----
  const itemsRows = params.items
    .map((it) => {
      const img = toEmailImage(it.image);
      const optionsHtml = (it.options || [])
        .filter((o) => o && o.value)
        .map(
          (o) =>
            `<div style="color:#8c8079;font-size:12px;">${escapeHtml(
              o.name
            )}: ${escapeHtml(o.value)}</div>`
        )
        .join("");
      const skuHtml = it.sku
        ? `<div style="color:#8c8079;font-size:12px;">SKU: ${escapeHtml(
            it.sku
          )}</div>`
        : "";
      const unitHtml = it.unitPrice
        ? `<div style="color:#8c8079;font-size:12px;">${fmtINR(
            escapeHtml(it.unitPrice)
          )}</div>`
        : "";
      const thumb = img
        ? `<img src="${escapeHtml(
            img
          )}" width="64" height="64" alt="" style="display:block;border-radius:8px;border:1px solid #efe8e4;object-fit:cover;" />`
        : `<div style="width:64px;height:64px;border-radius:8px;background:#f3ece8;"></div>`;
      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #f0eae6;vertical-align:top;width:64px;">
            ${thumb}
          </td>
          <td style="padding:14px 12px;border-bottom:1px solid #f0eae6;vertical-align:top;">
            <div style="font-weight:bold;color:#1A1410;">${escapeHtml(
              it.name
            )}</div>
            ${skuHtml}
            ${optionsHtml}
            ${unitHtml}
          </td>
          <td style="padding:14px 0;border-bottom:1px solid #f0eae6;vertical-align:top;text-align:center;color:#5c534d;white-space:nowrap;">
            Qty: ${escapeHtml(it.quantity)}
          </td>
          <td style="padding:14px 0;border-bottom:1px solid #f0eae6;vertical-align:top;text-align:right;white-space:nowrap;font-weight:bold;color:#1A1410;">
            ${it.lineTotal ? fmtINR(escapeHtml(it.lineTotal)) : ""}
          </td>
        </tr>`;
    })
    .join("");

  // ---- Price breakdown rows ----
  const s = params.summary || {};
  const summaryRow = (
    label: string,
    value: string | undefined,
    opts: { bold?: boolean; accent?: boolean } = {}
  ) =>
    value == null || value === ""
      ? ""
      : `<tr>
          <td style="padding:6px 0;color:${
            opts.accent ? BRAND : "#5c534d"
          };font-weight:${opts.bold ? "bold" : "normal"};font-size:${
          opts.bold ? "16px" : "14px"
        };">${escapeHtml(label)}</td>
          <td style="padding:6px 0;text-align:right;color:${
            opts.accent ? BRAND : "#1A1410"
          };font-weight:${opts.bold ? "bold" : "normal"};font-size:${
          opts.bold ? "16px" : "14px"
        };white-space:nowrap;">${fmtINR(escapeHtml(value))}</td>
        </tr>`;

  const summaryRows =
    summaryRow("Subtotal", s.subtotal) +
    summaryRow("Shipping", s.shipping) +
    summaryRow("Tax", s.tax) +
    (s.discount && Number(s.discount) > 0
      ? summaryRow("Discount", `-${s.discount}`, { accent: true })
      : "") +
    summaryRow(isPrepaid ? "Total paid" : "Total to pay", s.total || params.amount, {
      bold: true,
    });

  const subject = `Your Viora Jewels order ${params.orderNumber} is confirmed`;

  const html = `
  <div style="background:#f4efec;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #eee2dc;color:#1A1410;">

      <!-- Logo header -->
      <div style="padding:28px 24px 8px;text-align:center;">
        <img src="${LOGO_URL}" alt="Viora Jewels" width="120" style="display:inline-block;max-width:160px;height:auto;" />
      </div>

      <div style="padding:8px 32px 32px;">
        <h1 style="margin:18px 0 4px;font-size:24px;color:#1A1410;">Thanks for your order, ${escapeHtml(
          params.customerName
        )}!</h1>
        <p style="margin:0 0 18px;color:#5c534d;">We'll be in touch with updates about your order.</p>

        <!-- Order meta -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
          <tr>
            <td style="color:#1A1410;font-weight:bold;">Order ${escapeHtml(
              params.orderNumber
            )}</td>
            ${
              params.orderDate
                ? `<td style="text-align:right;color:#5c534d;">Placed on ${escapeHtml(
                    params.orderDate
                  )}</td>`
                : ""
            }
          </tr>
        </table>

        <!-- Payment status banner -->
        <div style="background:${
          isPrepaid ? "#eef7ef" : "#fdf6e9"
        };border:1px solid ${
    isPrepaid ? "#cfe8d2" : "#f0e2c0"
  };border-radius:10px;padding:14px 16px;margin-bottom:24px;">
          <p style="margin:0;color:#1A1410;">${paymentLine}</p>
        </div>

        <!-- Order summary -->
        <h2 style="margin:0 0 6px;font-size:15px;color:${BRAND};text-transform:uppercase;letter-spacing:.5px;">Order Summary</h2>
        <table style="width:100%;border-collapse:collapse;">
          ${itemsRows}
        </table>

        <!-- Totals -->
        <table style="width:100%;border-collapse:collapse;margin:14px 0 6px;">
          ${summaryRows}
        </table>

        <!-- Customer + delivery -->
        <table style="width:100%;border-collapse:collapse;margin-top:26px;">
          <tr>
            <td style="vertical-align:top;width:50%;padding-right:12px;">
              <h3 style="margin:0 0 8px;font-size:14px;color:${BRAND};">Customer</h3>
              <div style="color:#5c534d;line-height:1.6;">
                ${escapeHtml(params.customerName)}<br/>
                ${params.phone ? `${escapeHtml(params.phone)}<br/>` : ""}
                ${escapeHtml(params.to)}
              </div>
            </td>
            <td style="vertical-align:top;width:50%;padding-left:12px;">
              <h3 style="margin:0 0 8px;font-size:14px;color:${BRAND};">Delivery address</h3>
              <div style="color:#5c534d;line-height:1.6;">
                ${escapeHtml(addressText)}
              </div>
            </td>
          </tr>
        </table>

        <!-- Payment method -->
        <h3 style="margin:26px 0 6px;font-size:14px;color:${BRAND};">Payment</h3>
        <p style="margin:0;color:#5c534d;">${paymentLabel}</p>
        ${
          params.razorpayPaymentId
            ? `<p style="margin:2px 0 0;color:#9a8f88;font-size:12px;">Payment ID: ${escapeHtml(
                params.razorpayPaymentId
              )}</p>`
            : ""
        }

        <!-- Help -->
        <div style="border-top:1px solid #f0eae6;margin-top:28px;padding-top:20px;">
          <h3 style="margin:0 0 6px;font-size:15px;color:#1A1410;">Need assistance? Contact us.</h3>
          <p style="margin:0 0 6px;color:#5c534d;">We'll do everything we can to make sure you have a great experience with us.</p>
          <p style="margin:0;color:#5c534d;">Email us: <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND};">${SUPPORT_EMAIL}</a></p>
        </div>

        <!-- CTA -->
        <div style="text-align:center;margin-top:24px;">
          <a href="${SITE_URL}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:bold;">Visit our store</a>
        </div>
      </div>

      <div style="background:#faf7f5;padding:16px;text-align:center;color:#9a8f88;font-size:12px;">
        © Viora Jewels · <a href="${SITE_URL}" style="color:#9a8f88;">${SITE_URL.replace(
    /^https?:\/\//,
    ""
  )}</a>
      </div>
    </div>
  </div>`;

  const textLines = [
    `Thanks for your order, ${params.customerName}!`,
    `Order ${params.orderNumber}${
      params.orderDate ? ` — placed on ${params.orderDate}` : ""
    }`,
    "",
    isPrepaid
      ? `Payment received online — nothing to pay on delivery.`
      : `Cash on Delivery — keep ${fmtINR(params.amount)} ready for the courier.`,
    "",
    "Order summary:",
    ...params.items.map((it) => {
      const opts = (it.options || [])
        .filter((o) => o && o.value)
        .map((o) => `${o.name}: ${o.value}`)
        .join(", ");
      return `- ${it.name}${opts ? ` (${opts})` : ""} x${it.quantity}${
        it.lineTotal ? ` — ${fmtINR(it.lineTotal)}` : ""
      }`;
    }),
    "",
    s.subtotal ? `Subtotal: ${fmtINR(s.subtotal)}` : "",
    s.shipping ? `Shipping: ${fmtINR(s.shipping)}` : "",
    s.tax ? `Tax: ${fmtINR(s.tax)}` : "",
    s.discount && Number(s.discount) > 0
      ? `Discount: -${fmtINR(s.discount)}`
      : "",
    `${isPrepaid ? "Total paid" : "Total to pay"}: ${fmtINR(
      s.total || params.amount
    )}`,
    `Payment method: ${paymentLabel}`,
    params.razorpayPaymentId ? `Payment ID: ${params.razorpayPaymentId}` : "",
    "",
    `Delivery address: ${addressText}`,
    params.phone ? `Phone: ${params.phone}` : "",
    "",
    `Need help? Email ${SUPPORT_EMAIL}`,
    SITE_URL,
  ].filter(Boolean);

  return { subject, html, text: textLines.join("\n") };
};

/**
 * Sends the order confirmation email. Never throws — a failure here must not
 * fail the order (the order already exists and is paid). Returns whether the
 * email was sent so the caller can log it.
 */
export const sendOrderConfirmationEmail = async (
  params: OrderEmailParams
): Promise<boolean> => {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailAppPassword) {
    console.error("Order email skipped: GMAIL_USER / GMAIL_APP_PASSWORD missing.");
    return false;
  }

  const { subject, html, text } = renderOrderEmail(params);
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailAppPassword },
  });

  try {
    await transporter.sendMail({
      from: `"Viora Jewels" <${gmailUser}>`,
      to: params.to,
      subject,
      text,
      html,
    });
    return true;
  } catch (err) {
    console.error("Order confirmation email failed:", err);
    return false;
  }
};
