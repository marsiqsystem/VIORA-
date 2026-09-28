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

// ---- Pay online after a COD order -------------------------------------------
// Waives the COD charge. This label is written onto the Wix order as the
// discount description; normalizePaymentMode (src/lib/crm/wixOrder.js) keys on it.
export const COD_SWITCH_DISCOUNT_LABEL = "COD charge waived - paid online";
