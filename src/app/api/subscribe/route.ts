import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { sendNewsletterEmail } from "@/lib/newsletterEmail";
import { upsertNewsletterSubscriber } from "@/lib/newsletterContacts";

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

    // Store in Wix Contacts (labelled "Newsletter Subscriber") + send the
    // Viora-branded welcome. Both are best-effort — they must not block or
    // fail the request from the user's point of view, and admin still gets
    // notified regardless.
    const [contactRes, welcomeSent] = await Promise.all([
      upsertNewsletterSubscriber(clean),
      sendNewsletterEmail(clean),
    ]);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailAppPassword },
    });

    await transporter.sendMail({
      from: `"Viora Jewels Website" <${gmailUser}>`,
      to: NOTIFY_RECIPIENT,
      replyTo: clean,
      subject: "New newsletter subscriber",
      text: `New subscriber to the Viora List: ${clean}\n\nWix contact: ${
        contactRes.ok ? contactRes.contactId : `FAILED (${contactRes.reason})`
      }\nWelcome email: ${welcomeSent ? "sent" : "FAILED"}`,
      html: `<p style="font-family:Arial,sans-serif;">New subscriber to the <strong>Viora List</strong>:</p>
        <p style="font-family:Arial,sans-serif;font-size:16px;color:#9B1B30;">${clean}</p>
        <p style="font-family:Arial,sans-serif;font-size:12px;color:#555;">
          Wix contact: ${contactRes.ok ? contactRes.contactId : `FAILED (${contactRes.reason})`}<br/>
          Welcome email: ${welcomeSent ? "sent" : "FAILED"}
        </p>`,
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
