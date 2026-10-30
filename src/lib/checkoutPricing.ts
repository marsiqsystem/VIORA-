// Single source of truth for every offer the storefront shows or charges, so the
// product page, cart, checkout and server can never disagree.

// Prepaid (pay-online) perks: a flat discount ON TOP of free delivery. COD
// orders instead carry a delivery + handling charge. (The COD charge is also
// added to the Wix order server-side so the courier collects it — see
// src/app/api/wix/checkout/route.ts.)
export const PREPAID_DISCOUNT = 25;
export const COD_CHARGE = 49;

// ---- Spend ladder -----------------------------------------------------------
// Two Wix coupons. Wix allows ONE coupon per order, so the steps never stack.
// Change these together with the coupons' settings in Wix.
export const CLUB_VIORA_CODE = "CLUBVIORA";
export const CLUB_VIORA_MINIMUM = 999;
export const CLUB_VIORA_PERCENT = 10;

export const CLUB_VIORA_PLUS_CODE = "CLUBVIORA15";
export const CLUB_VIORA_PLUS_MINIMUM = 1599;
export const CLUB_VIORA_PLUS_PERCENT = 15;

export type CouponTier = {
  code: string;
  minimum: number;
  percent: number;
};

export const COUPON_TIERS: CouponTier[] = [
  { code: CLUB_VIORA_CODE, minimum: CLUB_VIORA_MINIMUM, percent: CLUB_VIORA_PERCENT },
  { code: CLUB_VIORA_PLUS_CODE, minimum: CLUB_VIORA_PLUS_MINIMUM, percent: CLUB_VIORA_PLUS_PERCENT },
];

/** Highest step the subtotal qualifies for, or null. */
export const bestTierFor = (subtotal: number): CouponTier | null =>
  [...COUPON_TIERS].reverse().find((t) => subtotal >= t.minimum) || null;

/** Next step still to unlock, or null once the top step is reached. */
export const nextTierFor = (subtotal: number): CouponTier | null =>
  COUPON_TIERS.find((t) => subtotal < t.minimum) || null;

/**
 * For when Wix hasn't reported a ladder coupon's amount yet: its percentage of
 * the subtotal, but only while the subtotal still meets that step's minimum.
 */
export const fallbackCouponDiscount = (code: string | undefined, subtotal: number) => {
  const tier = COUPON_TIERS.find((t) => t.code === code?.toUpperCase());
  return tier && subtotal >= tier.minimum ? (subtotal * tier.percent) / 100 : 0;
};

// ---- Festive combo ----------------------------------------------------------
// A Wix AUTOMATIC discount (no code): ₹100 off when the cart holds any two or
// more pieces (sets, earrings, or two of anything). Wix applies it; the site only
// advertises it inside this window, so keep both in sync. Times are IST.
export const FESTIVE_COMBO = {
  // Off (owner, 2026-09-28): no festive discount this season, and no Wix rule
  // exists. Set true only once the Wix automatic discount is live.
  enabled: false,
  amount: 100,
  startsAt: "2026-10-01T00:00:00+05:30",
  endsAt: "2026-11-11T23:59:59+05:30",
  endLabel: "11 Nov",
};

export const isFestiveComboLive = (now: number = Date.now()) =>
  FESTIVE_COMBO.enabled &&
  now >=Date.parse(FESTIVE_COMBO.startsAt) && now <= Date.parse(FESTIVE_COMBO.endsAt);

// ---- Photo review reward ----------------------------------------------------
// A Wix coupon limited to ONE use per customer. The code is only revealed to a
// signed-in customer who has ordered before, right after they post a review
// with a photo (see createProductReview in src/lib/reviewsActions.ts).
export const REVIEW_REWARD = { code: "PHOTO75", amount: 75, minimum: 699 };

// ---- Viora Coins (loyalty wallet) -------------------------------------------
// 1 coin = ₹1. Coins are a server-side wallet (src/lib/crm/vioraCoins.js), NOT a
// Wix coupon, so they stack on top of the spend-ladder coupon at checkout. Each
// amount below is granted once per the event named. Instagram-follow (5) is on
// hold for a future release. Dormant until COINS_ENABLED=1.
export const COIN_VALUE_INR = 1;
export const VIORA_COINS = {
  review: 75, // photo review on the website (once per account)
  signup: 10, // first login / account (once per account)
  prepaid: 30, // each prepaid order, on success
  codDelivered: 20, // each COD order, when it is delivered
};

// Prepaid orders normally get a ₹25 pay-online discount. When a customer spends
// a LOT of coins on a prepaid order (>= this many), we DON'T also give the ₹25 —
// otherwise the order gets too cheap. They still spend every coin (so it feels
// like a big discount) and still pay less than the no-coins prepaid price, so it
// never feels like a loss. COD is unaffected (the ₹49 charge already offsets it).
export const PREPAID_COIN_DISCOUNT_DROP_AT = 50;

// ---- Coins spend math (the ONE place both client & server compute it) -------
// Applies ONLY when the customer chooses to spend coins (coins > 0). A normal
// order never calls this and its pricing is completely unchanged.
//
// The owner's approved rules (Style A billing):
//   base      = productSubtotal + COD_CHARGE   (the ₹49 is BAKED into the base
//               for BOTH COD and prepaid, and is NEVER shown as its own line)
//   − coins   first (capped so the order can't drop to ₹0)
//   − ladder% on the REMAINDER (coins-first ordering, so the % is a bit smaller)
//   − ₹25     prepaid discount, only when paying online
// Examples: ₹500+75coins → COD ₹474, Prepaid ₹449. ₹1000+75coins+10% →
//   COD ₹876.6, Prepaid ₹851.6.
const round2 = (n: number) => Math.round(n * 100) / 100;

export type CoinsOrderBreakdown = {
  productSubtotal: number;
  base: number; // productSubtotal + COD_CHARGE for COD; productSubtotal for prepaid (free delivery)
  usedCoins: number; // coins actually spent (<= balance, capped so total > 0)
  afterCoins: number;
  ladderPercent: number;
  ladderDiscount: number;
  afterLadder: number;
  prepaidDiscount: number;
  finalTotal: number; // what the customer pays (COD cash / Razorpay amount)
};

/**
 * Compute a coins order's totals. `ladderPercent` is the spend-ladder % the cart
 * qualifies for (0 when none); pass it from bestTierFor(productSubtotal).
 */
export function computeCoinsOrder(input: {
  productSubtotal: number;
  paymentMethod: "COD" | "PREPAID";
  coins: number;
  ladderPercent: number;
}): CoinsOrderBreakdown {
  const productSubtotal = Math.max(0, round2(input.productSubtotal));
  // The ₹49 COD charge applies to COD ONLY. Prepaid keeps FREE delivery — baking
  // the ₹49 into prepaid made small-coin prepaid orders cost MORE than without
  // coins (e.g. ₹574 → ₹613), which is absurd. Now applying coins always lowers
  // the total for both methods.
  const codCharge = input.paymentMethod === "COD" ? COD_CHARGE : 0;
  const base = round2(productSubtotal + codCharge);
  // Spend every coin the customer has (capped only so the total can't hit ₹0).
  const usedCoins = Math.max(0, Math.min(Math.round(input.coins) || 0, Math.floor(base) - 1));
  const afterCoins = round2(base - usedCoins);
  const ladderPercent = input.ladderPercent > 0 ? input.ladderPercent : 0;
  const ladderDiscount = ladderPercent > 0 ? round2((afterCoins * ladderPercent) / 100) : 0;
  const afterLadder = round2(afterCoins - ladderDiscount);
  // Prepaid gets the ₹25 pay-online discount UNLESS a lot of coins are spent
  // (>= PREPAID_COIN_DISCOUNT_DROP_AT) — then the coins ARE the discount and we
  // don't stack the ₹25 on top (keeps a big-coin prepaid order from getting too
  // cheap). Still always below the ₹574 no-coins prepaid price. COD: no ₹25.
  const prepaidDiscount =
    input.paymentMethod === "PREPAID" && usedCoins < PREPAID_COIN_DISCOUNT_DROP_AT ? PREPAID_DISCOUNT : 0;
  const finalTotal = Math.max(0, round2(afterLadder - prepaidDiscount));
  return {
    productSubtotal,
    base,
    usedCoins,
    afterCoins,
    ladderPercent,
    ladderDiscount,
    afterLadder,
    prepaidDiscount,
    finalTotal,
  };
}

// ---- Pay online after a COD order -------------------------------------------
// Waives the COD charge. This label is written onto the Wix order as the
// discount description; normalizePaymentMode (src/lib/crm/wixOrder.js) keys on it.
export const COD_SWITCH_DISCOUNT_LABEL = "COD charge waived - paid online";
