// Shared, pragmatic email validation used before we send anything through our
// personal Gmail account. The goal is NOT to guarantee a mailbox exists — only
// Gmail's servers can know that — but to reject obviously-broken addresses
// (typos, missing TLD, stray spaces, double dots) BEFORE we send.
//
// Why this matters: every message we send to a bad address still counts against
// Gmail's daily sending quota, then bounces (550 5.1.1 "Address not found").
// A burst of those bounces is what trips the "You have reached a limit for
// sending mail" lock. Filtering junk up front keeps the quota for real mail.

/** Normalises an email for comparison/sending: trims and lowercases. */
export const normalizeEmail = (raw: unknown): string =>
  (typeof raw === "string" ? raw : "").trim().toLowerCase();

/**
 * Returns true only for structurally-valid addresses. Catches the junk we
 * actually see in bounces: missing @, missing/short TLD, spaces, leading or
 * trailing dots, and consecutive dots.
 */
export const isValidEmail = (raw: unknown): boolean => {
  const email = normalizeEmail(raw);
  if (!email || email.length > 254) return false;

  const at = email.indexOf("@");
  // Exactly one "@", and it isn't first or last char.
  if (at <= 0 || at !== email.lastIndexOf("@") || at === email.length - 1) {
    return false;
  }

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  // No spaces anywhere (already trimmed, but catches internal spaces).
  if (/\s/.test(email)) return false;

  // Local part: no leading/trailing/double dots.
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return false;
  }

  // Domain: must have a dot, a valid TLD (2+ letters), and no dot problems.
  if (
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    domain.startsWith("-") ||
    domain.includes("..") ||
    !/^[a-z0-9.-]+$/.test(domain) ||
    !/\.[a-z]{2,}$/.test(domain)
  ) {
    return false;
  }

  return true;
};
