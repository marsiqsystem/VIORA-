import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

const NOTIFY_RECIPIENT = "viorajewels6@gmail.com";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    const clean = typeof email === "string" ? email.trim() : "";

    if (!/^\S+@\S+\.\S+$/.test(clean)) {
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
        { error: "Subscription service is not configured. Please try again later." },
        { status: 500 }
      );
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailAppPassword },
    });

    await transporter.sendMail({
      from: `"Viora Jewels Website" <${gmailUser}>`,
      to: NOTIFY_RECIPIENT,
      replyTo: clean,
      subject: "New newsletter subscriber",
      text: `New subscriber to the Viora List: ${clean}`,
      html: `<p style="font-family:Arial,sans-serif;">New subscriber to the <strong>Viora List</strong>:</p>
        <p style="font-family:Arial,sans-serif;font-size:16px;color:#9B1B30;">${clean}</p>`,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Newsletter subscribe failed:", err);
    return NextResponse.json(
      { error: "Could not subscribe right now. Please try again later." },
      { status: 500 }
    );
  }
}
