import { NextResponse } from "next/server";
import { getTransporter, mailFrom } from "@/lib/mailer";
import {
  clientIp,
  isHoneypotFilled,
  isRateLimited,
  isSameOrigin,
} from "@/lib/apiGuard";

// Where exchange requests land. Same inbox as the contact form so the team sees
// everything in one place.
const EXCHANGE_RECIPIENT = "viorajewels6@gmail.com";
const BRAND = "#9B1B30";

// Cap the inlined photo so a huge upload can't blow past Gmail's message limit
// or hang the request. ~8MB of base64 ≈ ~6MB original.
const MAX_IMAGE_BASE64 = 8 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      orderId,
      orderNumber,
      productName,
      reason,
      description,
      customerName,
      customerEmail,
      customerPhone,
      image, // { base64, mimeType, fileName } — optional
    } = body || {};

    // Bot filled the hidden honeypot field: pretend success, send nothing.
    if (isHoneypotFilled(body)) {
      return NextResponse.json({ ok: true });
    }
    // Not submitted from our own site → almost certainly a bot/script.
    if (!isSameOrigin(req)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    // Throttle bursts so a bot can't drain the daily Gmail quota.
    if (isRateLimited(`exchange:${clientIp(req)}`)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    if (!reason?.trim()) {
      return NextResponse.json(
        { error: "Please select a reason for the exchange." },
        { status: 400 }
      );
    }

    const transporter = getTransporter();
    const from = mailFrom("Viora Jewels Website");
    if (!transporter || !from) {
      console.error("Mail not configured (MAIL_* / GMAIL_* missing).");
      return NextResponse.json(
        { error: "Email service is not configured. Please try again later." },
        { status: 500 }
      );
    }

    const escapeHtml = (s: unknown) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const orderLabel = orderNumber
      ? `#${escapeHtml(orderNumber)}`
      : orderId
      ? `${escapeHtml(String(orderId).slice(-8))} (id)`
      : "N/A";

    // ---- Attach the photo inline (if provided). We email the bytes directly
    // instead of hosting them, so the team always sees the actual evidence. ----
    const attachments: {
      filename: string;
      content: Buffer;
      cid: string;
    }[] = [];
    let imageError = false;
    if (image?.base64 && typeof image.base64 === "string") {
      if (image.base64.length > MAX_IMAGE_BASE64) {
        imageError = true;
      } else {
        try {
          attachments.push({
            filename: image.fileName || "exchange-photo.jpg",
            content: Buffer.from(image.base64, "base64"),
            cid: "evidence",
          });
        } catch {
          imageError = true;
        }
      }
    }
    const hasPhoto = attachments.length > 0;

    const row = (label: string, value: string) =>
      `<tr><td style="padding:6px 8px;font-weight:bold;width:120px;vertical-align:top;">${label}</td><td style="padding:6px 8px;">${value}</td></tr>`;

    const displayName = customerName?.trim() || "";
    const contactBits = [displayName, customerEmail, customerPhone]
      .filter((v) => v && String(v).trim())
      .map((v) => escapeHtml(v));

    await transporter.sendMail({
      from,
      to: EXCHANGE_RECIPIENT,
      replyTo: customerEmail ? String(customerEmail) : undefined,
      subject: `Exchange request — Order ${orderLabel}${
        displayName ? ` — ${displayName}` : ""
      }`,
      text: [
        `New exchange request`,
        ``,
        `Customer: ${displayName || "N/A"}`,
        customerEmail ? `Email: ${customerEmail}` : "",
        customerPhone ? `Phone: ${customerPhone}` : "",
        ``,
        `Order: ${orderNumber ? `#${orderNumber}` : orderId || "N/A"}`,
        `Order ID: ${orderId || "N/A"}`,
        productName ? `Product: ${productName}` : "",
        `Reason: ${reason}`,
        description ? `Details: ${description}` : "",
        hasPhoto
          ? `Photo: attached to this email`
          : imageError
          ? `Photo: customer attached one but it was too large to include`
          : `Photo: none attached`,
      ]
        .filter(Boolean)
        .join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1A1410;">
          <h2 style="color:${BRAND};margin-bottom:8px;">New exchange request</h2>

          <h3 style="margin:18px 0 4px;font-size:14px;color:${BRAND};">Requested by</h3>
          <table style="border-collapse:collapse;width:100%;">
            ${row("Customer", displayName ? escapeHtml(displayName) : "—")}
            ${customerEmail ? row("Email", `<a href="mailto:${escapeHtml(customerEmail)}" style="color:${BRAND};">${escapeHtml(customerEmail)}</a>`) : ""}
            ${customerPhone ? row("Phone", `<a href="tel:${escapeHtml(customerPhone)}" style="color:${BRAND};">${escapeHtml(customerPhone)}</a>`) : ""}
          </table>

          <h3 style="margin:18px 0 4px;font-size:14px;color:${BRAND};">Order details</h3>
          <table style="border-collapse:collapse;width:100%;">
            ${row("Order", orderLabel)}
            ${row("Order ID", escapeHtml(orderId || "N/A"))}
            ${productName ? row("Product", escapeHtml(productName)) : ""}
            ${row("Reason", escapeHtml(reason))}
            ${description ? row("Details", escapeHtml(description)) : ""}
          </table>

          <h3 style="margin:20px 0 6px;font-size:14px;color:${BRAND};">Photo</h3>
          ${
            hasPhoto
              ? `<img src="cid:evidence" alt="Exchange evidence" style="max-width:100%;border-radius:8px;border:1px solid #eee;" />`
              : imageError
              ? `<p style="color:#b45309;">The customer attached a photo, but it was too large to include. Please ask them to resend a smaller image.</p>`
              : `<p style="color:#8c8079;">No photo attached.</p>`
          }
          ${
            contactBits.length === 0
              ? `<p style="margin-top:16px;color:#8c8079;font-size:12px;">No customer contact captured — look up Order ${orderLabel} in Wix to reach the buyer.</p>`
              : ""
          }
        </div>
      `,
      attachments,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Exchange request send failed:", err);
    return NextResponse.json(
      { error: "Failed to submit your request. Please try again later." },
      { status: 500 }
    );
  }
}
