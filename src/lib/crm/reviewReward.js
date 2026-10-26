// Per-customer "₹75 off for a photo review" eligibility, KV-backed (Upstash).
//
// When a customer posts a photo review (via the WhatsApp capture flow), we mark
// THEM eligible — keyed by phone AND email, so we can recognise them at their
// next checkout whether they log in or order as a guest. At checkout the server
// looks them up and applies the discount automatically; once used, it's consumed
// so the voucher is one-per-earned-review. Self-expiring. Never throws.

import { REVIEW_REWARD } from "@/lib/checkoutPricing";

const PREFIX = "reviewreward:";
const TTL_S = 180 * 24 * 60 * 60; // 180 days to redeem

function kvCfg() {
  return {
    url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "")
      .trim()
      .replace(/\/$/, ""),
    token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim(),
  };
}
function isConfigured() {
  const { url, token } = kvCfg();
  return !!url && !!token;
}
async function command(args) {
  const { url, token } = kvCfg();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`kv command failed HTTP ${res.status}`);
  return data?.result;
}

// Last-10-digits for a phone (so +91/91/leading-zero variants all match), and a
// lowercased email. These become the lookup keys.
function phoneKey(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  const last10 = d.slice(-10);
  return last10.length === 10 ? `${PREFIX}phone:${last10}` : "";
}
function emailKey(email) {
  const e = String(email || "").trim().toLowerCase();
  return e && e.includes("@") ? `${PREFIX}email:${e}` : "";
}
function keysFor({ phone, email } = {}) {
  return [phoneKey(phone), emailKey(email)].filter(Boolean);
}

/**
 * Mark a customer eligible for the ₹75 photo-review voucher. Keyed by every
 * identifier we have (phone + email). Idempotent. Never throws.
 * @returns {Promise<boolean>} true if at least one key was written.
 */
export async function grantReviewReward({ phone, email, orderId } = {}) {
  if (!isConfigured()) return false;
  const keys = keysFor({ phone, email });
  if (!keys.length) return false;
  const blob = JSON.stringify({
    ...REVIEW_REWARD, // { code, amount, minimum }
    grantedAt: Date.now(),
    orderId: orderId || null,
  });
  let wrote = false;
  for (const k of keys) {
    try {
      await command(["SET", k, blob, "EX", String(TTL_S)]);
      wrote = true;
    } catch (e) {
      console.warn("[reviewReward] grant failed for a key:", e?.message || e);
    }
  }
  return wrote;
}

/**
 * Look up whether a customer has an unused ₹75 review voucher. Checks phone then
 * email. Returns the reward blob or null. Never throws (KV blip => null).
 * @returns {Promise<{code:string, amount:number, minimum:number}|null>}
 */
export async function getReviewReward({ phone, email } = {}) {
  if (!isConfigured()) return null;
  for (const k of keysFor({ phone, email })) {
    try {
      const raw = await command(["GET", k]);
      if (raw) return typeof raw === "object" ? raw : JSON.parse(raw);
    } catch {
      /* try the next key */
    }
  }
  return null;
}

/**
 * Consume (remove) the voucher across every identifier, so it can't be reused.
 * Call this once it has actually been applied to an order. Never throws.
 */
export async function consumeReviewReward({ phone, email } = {}) {
  if (!isConfigured()) return;
  for (const k of keysFor({ phone, email })) {
    try {
      await command(["DEL", k]);
    } catch {
      /* best-effort */
    }
  }
}

export { isConfigured };
