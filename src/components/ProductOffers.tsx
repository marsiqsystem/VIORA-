"use client";

import { useState } from "react";
import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";
import { useCommerceUi } from "@/hooks/useCommerceUi";
import {
  COD_CHARGE,
  COUPON_TIERS,
  FESTIVE_COMBO,
  PREPAID_DISCOUNT,
  isFestiveComboLive,
  nextTierFor,
  type CouponTier,
} from "@/lib/checkoutPricing";
import { isServiceLine, lineTotal } from "@/lib/cartLines";

const CheckIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const LockIcon = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 11h14v10H5zM8 11V7a4 4 0 018 0v4" />
  </svg>
);

type Props = {
  price: number;
  productId: string;
};

/**
 * "Offers for you" on the product page: the pay-online deal (leads, COD stays
 * visible below it), the spend ladder worked out from this piece's price and
 * whatever is already in the bag, and the festive combo while it runs. The bag
 * and checkout apply the best ladder code automatically, so the cards explain
 * that — and apply a code on tap when the bag already qualifies.
 */
const ProductOffers = ({ price, productId }: Props) => {
  const wixClient = useWixClient();
  const { cart, applyCoupon } = useCartStore();
  const { openDrawer, setShopperChoseCoupon } = useCommerceUi();
  const [applying, setApplying] = useState<string | null>(null);

  const prepaidPrice = Math.max(0, price - PREPAID_DISCOUNT);
  const codPrice = price + COD_CHARGE;
  const prepaidSaving = codPrice - prepaidPrice;

  const lineItems = cart?.lineItems || [];
  const bagSubtotal = lineItems.reduce((sum, item) => sum + lineTotal(item), 0);
  // Bag total excluding this product, which is counted once as the piece being viewed.
  const otherItemsTotal = lineItems
    .filter((item) => item.catalogReference?.catalogItemId !== productId)
    .reduce((sum, item) => sum + lineTotal(item), 0);
  const orderWithThis = otherItemsTotal + price;
  const otherPieces = lineItems
    .filter((item) => !isServiceLine(item) && item.catalogReference?.catalogItemId !== productId)
    .reduce((sum, item) => sum + (item.quantity || 1), 0);
  const appliedCode = String(
    ((cart as any)?.appliedDiscounts || []).find((d: any) => d.coupon)?.coupon?.code || ""
  ).toUpperCase();

  const top = COUPON_TIERS[COUPON_TIERS.length - 1];
  const next = nextTierFor(orderWithThis);
  const unlocked = COUPON_TIERS.filter((t) => orderWithThis >= t.minimum);
  const best = unlocked[unlocked.length - 1];
  const festiveLive = isFestiveComboLive();

  let ladderMessage: React.ReactNode;
  if (!next) {
    ladderMessage = (
      <>
        This order qualifies for <b>{top.percent}% OFF</b> — applied for you in your bag, saving{" "}
        <b>₹{Math.round((orderWithThis * top.percent) / 100)}</b>.
      </>
    );
  } else {
    // Pieces of similar price still needed for each locked step.
    const hints = COUPON_TIERS.filter((t) => orderWithThis < t.minimum).map((t, i) => {
      const pieces = price > 0 ? Math.ceil((t.minimum - orderWithThis) / price) : 0;
      const what = `${t.percent}% OFF`;
      return i === 0
        ? `Add ${pieces} more piece${pieces === 1 ? "" : "s"} for ${what}`
        : `${pieces} more for ${what}`;
    });
    ladderMessage = (
      <>
        {best && <b>{best.percent}% OFF unlocked. </b>}
        {hints.join(" · ")}.
      </>
    );
  }

  const tierStatus = (tier: CouponTier) => {
    if (appliedCode === tier.code) return "✓ Applied to your bag";
    if (bagSubtotal >= tier.minimum) return "Tap to apply to your bag";
    if (orderWithThis >= tier.minimum) return "✓ Unlocks with this piece";
    return "Auto-applies in your bag";
  };

  // Locked step: jump to pieces that go with this one. Qualifying bag: apply now.
  const chooseTier = (tier: CouponTier) => {
    if (orderWithThis < tier.minimum) {
      document.getElementById("add-to-order")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    applyTier(tier);
  };

  const applyTier = async (tier: CouponTier) => {
    if (applying || appliedCode === tier.code || bagSubtotal < tier.minimum) return;
    setApplying(tier.code);
    setShopperChoseCoupon(false);
    await applyCoupon(wixClient, tier.code);
    setApplying(null);
    openDrawer();
  };

  return (
    <section aria-labelledby="offers-title">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="offers-title" className="font-inter text-sm font-semibold uppercase tracking-wider text-primary">
          Offers for you
        </h2>
        <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-white">
          {festiveLive ? 3 : 2}
        </span>
      </div>

      <div className="space-y-3">
        {/* Pay online — leads; COD stays clearly available underneath */}
        <div>
          <div className="overflow-hidden rounded-xl border-2 border-green-600">
            <div className="flex items-center justify-between gap-2 bg-green-600 px-3 py-1.5 text-white">
              <span className="text-[11px] font-bold uppercase tracking-wider">Best price · Pay online</span>
              <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-extrabold text-green-700">
                SAVE ₹{prepaidSaving}
              </span>
            </div>
            <div className="bg-green-50 px-3 py-3">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-2xl font-bold text-green-800">₹{prepaidPrice}</span>
                <span className="text-sm text-gray-400 line-through">₹{codPrice}</span>
                <span className="text-xs font-medium text-green-700">with UPI / card</span>
              </p>
              <ul className="mt-2 grid gap-1 text-[13px] text-green-900 sm:grid-cols-2">
                <li className="flex items-center gap-1.5">
                  <CheckIcon className="h-4 w-4 flex-shrink-0 text-green-600" />
                  FREE delivery (save ₹{COD_CHARGE})
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckIcon className="h-4 w-4 flex-shrink-0 text-green-600" />
                  Extra ₹{PREPAID_DISCOUNT} off, auto-applied
                </li>
              </ul>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-green-800/80">
                <LockIcon className="h-3.5 w-3.5 flex-shrink-0" />
                UPI, cards &amp; more · Secured by Razorpay
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Prefer cash? Cash on Delivery available at ₹{codPrice} (incl. ₹{COD_CHARGE} COD charge).
          </p>
        </div>

        {/* Spend ladder as bundle cards: this piece alone, then each coupon step */}
        <div>
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-gray-200" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Spend more, save more</span>
            <span className="h-px flex-1 bg-gray-200" />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div
              className={`flex flex-col items-center justify-center bg-white px-1.5 py-3 text-center ${
                best ? "border border-gray-200" : "border-2 border-primary"
              }`}
            >
              <span className="text-sm font-bold leading-tight text-primary">This piece</span>
              <span className="text-[11px] text-gray-500">Standard price</span>
              <span className="mt-2 text-base font-bold text-primary">₹{price}</span>
            </div>

            {COUPON_TIERS.map((t, i) => {
              const isUnlocked = orderWithThis >= t.minimum;
              const isBest = best?.code === t.code;
              const canApplyNow = bagSubtotal >= t.minimum && appliedCode !== t.code;
              const piecesLeft = price > 0 ? Math.ceil((t.minimum - orderWithThis) / price) : 0;
              // Worked example at this price, only while the bag is otherwise empty.
              const examplePieces = price > 0 ? Math.max(1, Math.ceil(t.minimum / price)) : 0;
              const exampleTotal = examplePieces * price;
              const showExample = otherItemsTotal === 0 && examplePieces > 1;
              const isTop = i === COUPON_TIERS.length - 1;
              return (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => chooseTier(t)}
                  disabled={!!applying || (isUnlocked && !canApplyNow)}
                  aria-label={`${t.percent}% off above ₹${t.minimum}: ${tierStatus(t)}`}
                  className={`relative flex flex-col items-center justify-center px-1.5 pb-3 pt-4 text-center transition-colors disabled:cursor-default ${
                    isBest ? "border-2 border-accent bg-accent/5" : "border border-gray-200 bg-white hover:border-accent/60"
                  }`}
                >
                  {isTop && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                      Best value
                    </span>
                  )}
                  <span className="text-sm font-bold leading-tight text-primary">{t.percent}% OFF</span>
                  <span className="text-[11px] leading-tight text-gray-500">
                    above ₹{t.minimum}
                  </span>
                  {showExample ? (
                    <span className="mt-2 leading-tight">
                      <span className="block text-base font-bold text-primary">
                        ₹{Math.round(exampleTotal * (1 - t.percent / 100))}
                      </span>
                      <span className="block text-[10px] text-gray-500">
                        <s>₹{exampleTotal}</s> for {examplePieces}
                      </span>
                    </span>
                  ) : (
                    <span className="mt-2 text-[11px] font-semibold leading-tight text-gray-600">
                      above ₹{t.minimum}
                    </span>
                  )}
                  <span
                    className={`mt-1.5 text-[10px] font-semibold uppercase leading-tight tracking-wide ${
                      isUnlocked ? "text-green-700" : "text-accent"
                    }`}
                  >
                    {applying === t.code
                      ? "Applying…"
                      : appliedCode === t.code
                        ? "✓ Applied"
                        : isUnlocked
                          ? canApplyNow
                            ? "Tap to apply"
                            : "✓ Unlocked"
                          : `Add ${piecesLeft} more`}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs leading-snug text-gray-700">{ladderMessage}</p>
          <p className="mt-1 text-[11px] text-gray-500">
            No code needed: the best discount is applied in your bag and stacks with the pay-online discount.
          </p>
        </div>

        {/* Festive combo — automatic, only advertised while the Wix rule runs */}
        {festiveLive && (
          <div className="border-2 border-amber-400 bg-gradient-to-r from-amber-50 to-rose-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
              🪔 Festive combo · till {FESTIVE_COMBO.endLabel}
            </p>
            <p className="text-base font-bold leading-tight text-primary">
              ₹{FESTIVE_COMBO.amount} OFF any 2 pieces
            </p>
            <p className="mt-1 text-xs text-gray-700">
              {otherPieces > 0
                ? "This piece + what's in your bag makes two — the discount applies automatically."
                : "Add any second set or earrings to your order — the discount applies automatically."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default ProductOffers;
