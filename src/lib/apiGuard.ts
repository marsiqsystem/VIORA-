// Lightweight abuse protection for the public form endpoints (/api/subscribe,
// /api/contact) that send mail through our personal Gmail on every POST.
//
// Why this exists: those endpoints had no protection at all. A spam bot that
// crawls the site and hammers a form endpoint makes us send (and bounce) huge
// numbers of mails, which trips Gmail's "You have reached a limit for sending
// mail" lock and flags the account — even though real traffic is tiny.
//
// None of this needs an external store. It is deliberately best-effort:
//   1. Honeypot  — reject requests where a hidden field was filled (bots do).
//   2. Same-origin — reject requests not sent from our own site (curl/scripts).
//   3. Rate limit — per-IP throttle within a warm serverless instance.

/** Hidden field name the real forms include (always empty for humans). */
export const HONEYPOT_FIELD = "company";

/** True if the honeypot field has any value — i.e. a bot filled it. */
export const isHoneypotFilled = (body: Record<string, unknown>): boolean => {
  const v = body?.[HONEYPOT_FIELD];
  return typeof v === "string" && v.trim().length > 0;
};

const hostOf = (value: string | null): string | null => {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
};

/**
 * True when the request looks like it came from our own site's form. A browser
 * fetch POST always sends an Origin header whose host matches the site host;
 * direct bot/script hits are usually cross-origin or send neither Origin nor
 * Referer. We only *block* a clear mismatch, so legitimate submissions pass.
 */
export const isSameOrigin = (req: Request): boolean => {
  const selfHost = hostOf(`https://${req.headers.get("host") || ""}`);
  const originHost = hostOf(req.headers.get("origin"));
  const refererHost = hostOf(req.headers.get("referer"));

  // No proof of a browser context at all → treat as bot.
  if (!originHost && !refererHost) return false;
  // If Origin is present it must match our host.
  if (originHost && selfHost && originHost !== selfHost) return false;
  // If only Referer is present, it must match our host.
  if (!originHost && refererHost && selfHost && refererHost !== selfHost) {
    return false;
  }
  return true;
};

/** Best-effort client IP from the usual proxy headers. */
export const clientIp = (req: Request): string =>
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";

// Module-level store. Resets on cold start and is per-instance, but still
// throttles a burst that hits the same warm lambda — enough to stop a bot from
// draining the daily quota.
const hits = new Map<string, number[]>();

/**
 * Returns true if `key` is over `max` requests within `windowMs`. Prunes old
 * timestamps as it goes.
 */
export const isRateLimited = (
  key: string,
  max = 5,
  windowMs = 10 * 60 * 1000
): boolean => {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (hits.size > 5000) {
    Array.from(hits.entries()).forEach(([k, v]) => {
      if (v.every((t: number) => now - t >= windowMs)) hits.delete(k);
    });
  }
  return recent.length > max;
};
