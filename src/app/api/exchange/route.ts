import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      orderId,
      orderNumber,
      productName,
      reason,
      description,
      mediaUrl,
      customerEmail,
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

    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailAppPassword) {
      console.error("GMAIL_USER or GMAIL_APP_PASSWORD missing from env.");
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

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailAppPassword },
    });

    const row = (label: string, value: string) =>
      `<tr><td style="padding:6px 8px;font-weight:bold;width:120px;vertical-align:top;">${label}</td><td style="padding:6px 8px;">${value}</td></tr>`;

    await transporter.sendMail({
      from: `"Viora Jewels Website" <${gmailUser}>`,
      to: EXCHANGE_RECIPIENT,
      replyTo: customerEmail ? String(customerEmail) : undefined,
      subject: `Exchange request — Order ${orderLabel}`,
      text: [
        `New exchange request`,
        ``,
        `Order: ${orderNumber ? `#${orderNumber}` : orderId || "N/A"}`,
        `Order ID: ${orderId || "N/A"}`,
        productName ? `Product: ${productName}` : "",
        `Reason: ${reason}`,
        description ? `Details: ${description}` : "",
        customerEmail ? `Customer: ${customerEmail}` : "",
        mediaUrl ? `Photo: ${mediaUrl}` : "No photo attached",
      ]
        .filter(Boolean)
        .join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1A1410;">
          <h2 style="color:${BRAND};margin-bottom:8px;">New exchange request</h2>
          <table style="border-collapse:collapse;width:100%;margin-top:12px;">
            ${row("Order", orderLabel)}
            ${row("Order ID", escapeHtml(orderId || "N/A"))}
            ${productName ? row("Product", escapeHtml(productName)) : ""}
            ${row("Reason", escapeHtml(reason))}
            ${description ? row("Details", escapeHtml(description)) : ""}
            ${customerEmail ? row("Customer", escapeHtml(customerEmail)) : ""}
          </table>
          ${
            mediaUrl
              ? `<h3 style="margin-top:20px;margin-bottom:6px;">Attached photo</h3>
                 <a href="${escapeHtml(mediaUrl)}" target="_blank" rel="noreferrer">
                   <img src="${escapeHtml(
                     mediaUrl
                   )}" alt="Exchange evidence" style="max-width:100%;border-radius:8px;border:1px solid #eee;" />
                 </a>
                 <p style="margin-top:6px;"><a href="${escapeHtml(
                   mediaUrl
                 )}" style="color:${BRAND};">Open full image</a></p>`
              : `<p style="margin-top:16px;color:#8c8079;">No photo attached.</p>`
          }
        </div>
      `,
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
