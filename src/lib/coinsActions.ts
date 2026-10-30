"use server";

// Member-scoped Viora Coins actions for the storefront. Each resolves the
// logged-in member from their own session cookie (wixClientServer), so the
// balance can never be read or moved for someone else — the client only ever
// triggers these, never carries a balance. All no-op / return 0 unless
// COINS_ENABLED=1.

import { wixClientServer } from "@/lib/wixClientServer";
import { VIORA_COINS } from "@/lib/checkoutPricing";
import { earn, getBalance, takeUnseen, coinsEnabled, hasEarned } from "@/lib/crm/vioraCoins";

/** The current logged-in member's contactId, or null for a guest. */
async function currentContactId(): Promise<string | null> {
  try {
    const wixClient = await wixClientServer();
    if (!wixClient.auth.loggedIn()) return null;
    const res = await wixClient.members.getCurrentMember({ fieldsets: ["FULL"] } as any);
    return res?.member?.contactId || res?.member?._id || null;
  } catch {
    return null;
  }
}

/** Current coin balance for the logged-in member (0 for guests / when off). */
export async function getCoinBalance(): Promise<number> {
  if (!coinsEnabled()) return 0;
  const id = await currentContactId();
  return id ? getBalance(id) : 0;
}

/**
 * Grant the one-time login/account bonus. Idempotent per account
 * (reasonKey "signup:<contactId>"), so it's the first login only — never every
 * login. Returns coins newly earned (0 if already claimed / guest / off).
 */
export async function grantLoginBonus(): Promise<{ coinsEarned: number; balance: number }> {
  if (!coinsEnabled()) return { coinsEarned: 0, balance: 0 };
  const id = await currentContactId();
  if (!id) return { coinsEarned: 0, balance: 0 };
  const res = await earn({
    contactId: id,
    amount: VIORA_COINS.signup,
    reasonKey: `signup:${id}`,
    note: "Welcome bonus",
  });
  return { coinsEarned: res.earned ? res.amount : 0, balance: res.balance };
}

/**
 * Per-member earn status for the /viora-coins page, so each "way to earn" can
 * show a claimed state. loginClaimed / reviewClaimed are the once-per-account
 * steps; prepaid/COD are per-order so they have no single claimed flag.
 */
export async function getEarnStatus(): Promise<{
  loggedIn: boolean;
  balance: number;
  loginClaimed: boolean;
  reviewClaimed: boolean;
}> {
  const off = { loggedIn: false, balance: 0, loginClaimed: false, reviewClaimed: false };
  if (!coinsEnabled()) return off;
  const id = await currentContactId();
  if (!id) return off;
  const [balance, loginClaimed, reviewClaimed] = await Promise.all([
    getBalance(id),
    hasEarned(`signup:${id}`),
    hasEarned(`review:${id}`),
  ]);
  return { loggedIn: true, balance, loginClaimed, reviewClaimed };
}

/**
 * Pop pending "you earned X coins" notes for the congratulations popup, clearing
 * them so each shows once. Covers async earns (e.g. a COD order delivered while
 * the shopper was away) on their next visit.
 */
export async function takeCoinPopup(): Promise<{ total: number; count: number }> {
  if (!coinsEnabled()) return { total: 0, count: 0 };
  const id = await currentContactId();
  return id ? takeUnseen(id) : { total: 0, count: 0 };
}
