import { NextResponse } from "next/server";
import { getMailer, MAIL_FROM_TRANSACTIONAL } from "@/lib/mailer";
import { sendNewsletterEmail } from "@/lib/newsletterEmail";
import { markWelcomeSent, upsertNewsletterSubscriber } from "@/lib/newsletterContacts";
import { isValidEmail, normalizeEmail } from "@/lib/validateEmail";
import {
  clientIp,
  isHoneypotFilled,
  isRateLimited,
  isSameOrigin,
} from "@/lib/apiGuard";

const NOTIFY_RECIPIENT = "viorajewels6@gmail.com";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email } = body;

    // Bot filled the hidden honeypot field: pretend success, send nothing.
    if (isHoneypotFilled(body)) {
      return NextResponse.json({ ok: true });
    }
    // Not submitted from our own site's form → almost certainly a bot/script.
    if (!isSameOrigin(req)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    // Throttle bursts so a bot can't drain the daily Gmail quota.
    if (isRateLimited(`subscribe:${clientIp(req)}`)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Normalise (trim + lowercase) so we store and send one canonical form and
    // don't add the same address twice under different casing.
    const clean = normalizeEmail(email);

    if (!isValidEmail(clean)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const transporter = getMailer();
    if (!transporter) {
      console.error("RESEND_API_KEY missing from env.");
      return NextResponse.json(
        { error: "Subscription service is not configured. Please try again later." },
        { status: 500 }
      );
    }

    // Store in Wix Contacts (labelled "Newsletter Subscriber"), THEN send the
    // Viora-branded welcome — in that order, because the contact record tells
    // us whether this address was already welcomed. Re-subscribing must never
    // produce a second copy of the same email. Both steps are best-effort:
    // they must not block or fail the request from the user's point of view,
    // and admin still gets notified regardless.
    const contactRes = await upsertNewsletterSubscriber(clean);

    let welcomeSent = false;
    let welcomeStatus: string;

    if (contactRes.alreadyWelcomed) {
      welcomeStatus = "skipped (already welcomed)";
    } else {
      welcomeSent = await sendNewsletterEmail(clean);
      welcomeStatus = welcomeSent ? "sent" : "FAILED";
      // Record it so no later subscribe or blast run sends a second copy.
      if (welcomeSent && contactRes.contactId) {
        await markWelcomeSent(contactRes.contactId);
      }
    }

    await transporter.sendMail({
      from: MAIL_FROM_TRANSACTIONAL,
      to: NOTIFY_RECIPIENT,
      replyTo: clean,
      subject: "New newsletter subscriber",
      text: `New subscriber to the Viora List: ${clean}\n\nWix contact: ${
        contactRes.ok ? contactRes.contactId : `FAILED (${contactRes.reason})`
      }\nWelcome email: ${welcomeStatus}`,
      html: `<p style="font-family:Arial,sans-serif;">New subscriber to the <strong>Viora List</strong>:</p>
        <p style="font-family:Arial,sans-serif;font-size:16px;color:#9B1B30;">${clean}</p>
        <p style="font-family:Arial,sans-serif;font-size:12px;color:#555;">
          Wix contact: ${contactRes.ok ? contactRes.contactId : `FAILED (${contactRes.reason})`}<br/>
          Welcome email: ${welcomeStatus}
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
