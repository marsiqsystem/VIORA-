import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

const CONTACT_RECIPIENT = "viorajewels6@gmail.com";

export async function POST(req: Request) {
  try {
    const { title, firstName, lastName, email, query } = await req.json();

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !query?.trim()) {
      return NextResponse.json(
        { error: "Please fill in all required fields." },
        { status: 400 }
      );
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
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

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailAppPassword },
    });

    const fullName = [title, firstName, lastName].filter(Boolean).join(" ").trim();
    const safeText = (s: string) => String(s).replace(/[\r\n]+/g, " ").trim();
    const escapeHtml = (s: string) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    await transporter.sendMail({
      from: `"Viora Jewels Website" <${gmailUser}>`,
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
