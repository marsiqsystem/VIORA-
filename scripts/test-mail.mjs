// SMTP diagnostic. Prints the *exact* server response for the Titan (MAIL_*)
// credentials, and separately for the legacy Gmail (GMAIL_*) fallback, so an
// auth failure can be told apart from a wrong host/port or a blocked account.
//
// Usage (from project root):
//   node --env-file=.env.local scripts/test-mail.mjs
//   node --env-file=.env.local scripts/test-mail.mjs you@example.com
//
// With a recipient argument it also sends a real test message through whichever
// provider authenticated. Without one it only runs verify() — no mail is sent.

import nodemailer from "nodemailer";

const {
  MAIL_HOST,
  MAIL_PORT,
  MAIL_USER,
  MAIL_PASS,
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
} = process.env;

const recipient = process.argv[2]?.trim();

// A password that *looks* right in a dashboard but has a stray space or a
// pasted newline is the single most common cause of 535. Never print the
// secret itself — print the shape of it.
const describeSecret = (value) => {
  if (!value) return "MISSING";
  const flags = [];
  if (value !== value.trim()) flags.push("HAS LEADING/TRAILING WHITESPACE");
  if (/[\r\n]/.test(value)) flags.push("CONTAINS A NEWLINE");
  if (/^["'].*["']$/.test(value)) flags.push("WRAPPED IN QUOTES");
  return `${value.length} chars, starts "${value.slice(0, 2)}…", ends "…${value.slice(-2)}"${
    flags.length ? ` — ⚠ ${flags.join(", ")}` : ""
  }`;
};

const report = (err) => {
  console.log(`   code:     ${err?.code || "—"}`);
  console.log(`   response: ${err?.response || err?.message || err}`);
  if (err?.responseCode) console.log(`   status:   ${err.responseCode}`);
};

const tryTransport = async (label, options, fromAddress) => {
  console.log(`\n── ${label} ──`);
  const transporter = nodemailer.createTransport(options);
  try {
    await transporter.verify();
    console.log("   ✅ AUTH OK — the server accepted these credentials.");
  } catch (err) {
    console.log("   ❌ FAILED");
    report(err);
    return false;
  }

  if (recipient) {
    try {
      await transporter.sendMail({
        from: `"Viora Jewels" <${fromAddress}>`,
        to: recipient,
        subject: `SMTP test via ${label}`,
        text: `If you are reading this, ${label} can send mail. Sent ${new Date().toISOString()}.`,
      });
      console.log(`   ✅ Test message sent to ${recipient}.`);
    } catch (err) {
      console.log("   ⚠ Authenticated, but the send failed:");
      report(err);
    }
  }
  return true;
};

console.log("Config seen by this process");
console.log(`  MAIL_HOST: ${MAIL_HOST || "MISSING"}`);
console.log(`  MAIL_PORT: ${MAIL_PORT || "(defaulting to 465)"}`);
console.log(`  MAIL_USER: ${MAIL_USER || "MISSING"}`);
console.log(`  MAIL_PASS: ${describeSecret(MAIL_PASS)}`);
console.log(`  GMAIL_USER: ${GMAIL_USER || "MISSING"}`);
console.log(`  GMAIL_APP_PASSWORD: ${describeSecret(GMAIL_APP_PASSWORD)}`);

if (MAIL_HOST && MAIL_USER && MAIL_PASS) {
  // Try both ports: 465 is implicit TLS, 587 is STARTTLS. Some hosts allow only
  // one of them, and that shows up as an auth-ish failure on the wrong port.
  const ports = MAIL_PORT ? [Number(MAIL_PORT)] : [465, 587];
  for (const port of ports) {
    await tryTransport(
      `Titan ${MAIL_HOST}:${port}`,
      {
        host: MAIL_HOST,
        port,
        secure: port === 465,
        auth: { user: MAIL_USER, pass: MAIL_PASS },
      },
      MAIL_USER
    );
  }
} else {
  console.log("\n── Titan ── skipped: MAIL_HOST / MAIL_USER / MAIL_PASS not all set.");
}

if (GMAIL_USER && GMAIL_APP_PASSWORD) {
  await tryTransport(
    "Gmail fallback",
    { service: "gmail", auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } },
    GMAIL_USER
  );
} else {
  console.log("\n── Gmail fallback ── skipped: GMAIL_USER / GMAIL_APP_PASSWORD not set.");
}
