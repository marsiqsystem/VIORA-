import nodemailer from "nodemailer";

// Branded order-confirmation email sent from our own Gmail account, so the
// customer sees the correct amount and the correct payment status — unlike
// Wix's automatic email, which always shows the "pay cash to courier" text and
// (before the draft-order discount) the pre-discount total.
//
// To avoid customers receiving two emails, Wix's automatic order confirmation
// email should be turned OFF in the Wix dashboard
// (Settings → Notifications / Automations → "Order confirmation").

type OrderEmailItem = {
  name: string;
  quantity: number;
  /** Per-line total as a display string, e.g. "529.00". Optional. */
  lineTotal?: string;
};

export type OrderEmailParams = {
  to: string;
  customerName: string;
  orderNumber: string;
  paymentMethod: "COD" | "PREPAID";
  /** The amount the customer actually pays (₹479 for prepaid, full total for COD). */
  amount: string;
  razorpayPaymentId?: string;
  items: OrderEmailItem[];
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

const fmtINR = (amount: string) => `₹${amount}`;

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

  const isPrepaid = params.paymentMethod === "PREPAID";

  const paymentLine = isPrepaid
    ? `Payment received online — <strong>nothing to pay on delivery.</strong>`
    : `Cash on Delivery — please keep <strong>${fmtINR(
        params.amount
      )}</strong> ready to pay the courier on delivery.`;

  const paymentLabel = isPrepaid
    ? `Paid online (Razorpay)`
    : `Cash on Delivery`;

  const addressText = [
    params.address.line1,
    params.address.city,
    params.address.state,
    params.address.postalCode,
  ]
    .filter(Boolean)
    .join(", ");

  const itemsRows = params.items
    .map(
      (it) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f0eae6;">
            ${escapeHtml(it.name)} <span style="color:#9a8f88;">×${escapeHtml(
        it.quantity
      )}</span>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #f0eae6;text-align:right;white-space:nowrap;">
            ${it.lineTotal ? fmtINR(escapeHtml(it.lineTotal)) : ""}
          </td>
        </tr>`
    )
    .join("");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailAppPassword },
  });

  const subject = `Your Viora Jewels order ${params.orderNumber} is confirmed`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1A1410;background:#ffffff;">
    <div style="background:#9B1B30;padding:24px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:22px;letter-spacing:1px;">VIORA JEWELS</h1>
    </div>
    <div style="padding:28px 24px;">
      <h2 style="color:#9B1B30;margin:0 0 6px;">Thank you, ${escapeHtml(
        params.customerName
      )}!</h2>
      <p style="margin:0 0 18px;color:#5c534d;">
        Your order <strong>${escapeHtml(
          params.orderNumber
        )}</strong> has been confirmed.
      </p>

      <div style="background:${
        isPrepaid ? "#eef7ef" : "#fdf6e9"
      };border:1px solid ${
    isPrepaid ? "#cfe8d2" : "#f0e2c0"
  };border-radius:10px;padding:14px 16px;margin-bottom:22px;">
        <p style="margin:0;color:#1A1410;">${paymentLine}</p>
      </div>

      <table style="border-collapse:collapse;width:100%;margin-bottom:8px;">
        ${itemsRows}
      </table>

      <table style="border-collapse:collapse;width:100%;margin-top:10px;">
        <tr>
          <td style="padding:10px 0;font-weight:bold;font-size:16px;">
            ${isPrepaid ? "Amount paid" : "Amount to pay on delivery"}
          </td>
          <td style="padding:10px 0;font-weight:bold;font-size:16px;text-align:right;">
            ${fmtINR(escapeHtml(params.amount))}
          </td>
        </tr>
      </table>

      <h3 style="margin:24px 0 6px;font-size:14px;color:#9B1B30;">Payment method</h3>
      <p style="margin:0 0 4px;color:#5c534d;">${paymentLabel}</p>
      ${
        params.razorpayPaymentId
          ? `<p style="margin:0;color:#9a8f88;font-size:12px;">Payment ID: ${escapeHtml(
              params.razorpayPaymentId
            )}</p>`
          : ""
      }

      <h3 style="margin:24px 0 6px;font-size:14px;color:#9B1B30;">Delivery address</h3>
      <p style="margin:0;color:#5c534d;">${escapeHtml(addressText)}</p>
      ${
        params.phone
          ? `<p style="margin:4px 0 0;color:#5c534d;">Phone: ${escapeHtml(
              params.phone
            )}</p>`
          : ""
      }

      <p style="margin:28px 0 0;color:#9a8f88;font-size:12px;line-height:1.6;">
        We'll notify you when your order ships. Questions? Just reply to this email.
      </p>
    </div>
    <div style="background:#faf7f5;padding:16px;text-align:center;color:#9a8f88;font-size:12px;">
      © Viora Jewels
    </div>
  </div>`;

  const textLines = [
    `Thank you, ${params.customerName}!`,
    `Your order ${params.orderNumber} has been confirmed.`,
    "",
    isPrepaid
      ? `Payment received online — nothing to pay on delivery.`
      : `Cash on Delivery — keep ${fmtINR(params.amount)} ready for the courier.`,
    "",
    ...params.items.map(
      (it) => `- ${it.name} x${it.quantity}${it.lineTotal ? ` — ${fmtINR(it.lineTotal)}` : ""}`
    ),
    "",
    `${isPrepaid ? "Amount paid" : "Amount to pay on delivery"}: ${fmtINR(params.amount)}`,
    `Payment method: ${paymentLabel}`,
    params.razorpayPaymentId ? `Payment ID: ${params.razorpayPaymentId}` : "",
    "",
    `Delivery address: ${addressText}`,
    params.phone ? `Phone: ${params.phone}` : "",
  ].filter(Boolean);

  try {
    await transporter.sendMail({
      from: `"Viora Jewels" <${gmailUser}>`,
      to: params.to,
      subject,
      text: textLines.join("\n"),
      html,
    });
    return true;
  } catch (err) {
    console.error("Order confirmation email failed:", err);
    return false;
  }
};
