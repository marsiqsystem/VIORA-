import { NextResponse } from "next/server";
import { isMailConfigured, sendMail } from "@/lib/mailer";
import { isValidEmail } from "@/lib/validateEmail";
import {
  clientIp,
  isHoneypotFilled,
  isRateLimited,
  isSameOrigin,
} from "@/lib/apiGuard";

const CONTACT_RECIPIENT = "viorajewels6@gmail.com";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { title, firstName, lastName, email, query } = body;

    // Bot filled the hidden honeypot field: pretend success, send nothing.
    if (isHoneypotFilled(body)) {
      return NextResponse.json({ ok: true });
    }
    // Not submitted from our own site's form → almost certainly a bot/script.
    if (!isSameOrigin(req)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    // Throttle bursts so a bot can't drain the daily Gmail quota.
    if (isRateLimited(`contact:${clientIp(req)}`)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !query?.trim()) {
      return NextResponse.json(
        { error: "Please fill in all required fields." },
        { status: 400 }
      );
    }
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (!isMailConfigured()) {
      console.error("Mail not configured (MAIL_* / GMAIL_* missing).");
      return NextResponse.json(
        { error: "Email service is not configured. Please try again later." },
        { status: 500 }
      );
    }

    const fullName = [title, firstName, lastName].filter(Boolean).join(" ").trim();
    const safeText = (s: string) => String(s).replace(/[\r\n]+/g, " ").trim();
    const escapeHtml = (s: string) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    await sendMail({
      fromName: "Viora Jewels Website",
      to: CONTACT_RECIPIENT,
      replyTo: `"${safeText(fullName)}" <${safeText(email)}>`,
      subject: `Website enquiry from ${safeText(fullName)}`,
      text: [
        `Name: ${fullName}`,
        `Email: ${email}`,
        "",
        "Message:",
        query,
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1A1410;">
          <h2 style="color:#9B1B30;margin-bottom:8px;">New website enquiry</h2>
          <table style="border-collapse:collapse;width:100%;margin-top:12px;">
            <tr><td style="padding:6px 8px;font-weight:bold;width:90px;">Name</td><td style="padding:6px 8px;">${escapeHtml(fullName)}</td></tr>
            <tr><td style="padding:6px 8px;font-weight:bold;">Email</td><td style="padding:6px 8px;">${escapeHtml(email)}</td></tr>
          </table>
          <h3 style="margin-top:20px;margin-bottom:6px;">Message</h3>
          <div style="white-space:pre-wrap;background:#faf7f5;border:1px solid #eee;border-radius:8px;padding:12px;">${escapeHtml(query)}</div>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Contact form send failed:", err);
    return NextResponse.json(
      { error: "Failed to send your message. Please try again later." },
      { status: 500 }
    );
  }
}
