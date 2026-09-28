"use client";

import Link from "next/link";
import { useCartStore } from "@/hooks/useCartStore";
import { useCommerceUi } from "@/hooks/useCommerceUi";
import { LADDER_BANNER } from "@/data/homeAssets";
import {
  CLUB_VIORA_MINIMUM,
  CLUB_VIORA_PERCENT,
  CLUB_VIORA_PLUS_MINIMUM,
  CLUB_VIORA_PLUS_PERCENT,
  PREPAID_DISCOUNT,
  nextTierFor,
} from "@/lib/checkoutPricing";
import { isServiceLine, lineTotal } from "@/lib/cartLines";
import AssetImage from "./AssetImage";

/**
 * "Spend more, save more" — the three automatic rewards, and (when the shopper
 * already has a bag) exactly how far they are from the next one.
 */
const OfferLadderBanner = () => {
  const { cart } = useCartStore();
  const openDrawer = useCommerceUi((s) => s.openDrawer);
  const lines = (cart.lineItems || []).filter((li) => !isServiceLine(li));
  const subtotal = lines.reduce((sum, li) => sum + lineTotal(li), 0);
  const next = nextTierFor(subtotal);

  const steps = [
    { reached: subtotal > 0, label: "Pay online", reward: `FREE delivery + ₹${PREPAID_DISCOUNT} OFF` },
    { reached: subtotal >= CLUB_VIORA_MINIMUM, label: `Bag of ₹${CLUB_VIORA_MINIMUM}+`, reward: `${CLUB_VIORA_PERCENT}% OFF` },
    {
      reached: subtotal >= CLUB_VIORA_PLUS_MINIMUM,
      label: `Bag of ₹${CLUB_VIORA_PLUS_MINIMUM}+`,
      reward: `${CLUB_VIORA_PLUS_PERCENT}% OFF`,
    },
  ];

  return (
    <section aria-labelledby="offer-ladder" className="relative overflow-hidden bg-accent text-white">
      <div className="absolute inset-0 md:hidden">
        {LADDER_BANNER.mobile.src && <AssetImage image={LADDER_BANNER.mobile} sizes="100vw" />}
      </div>
      <div className="absolute inset-0 hidden md:block">
        {LADDER_BANNER.desktop.src && <AssetImage image={LADDER_BANNER.desktop} sizes="100vw" />}
      </div>
      <div className="absolute inset-0 bg-gradient-to-br from-accent via-accent/95 to-[#5A0A18]/95" aria-hidden="true" />

      <div className="relative px-4 py-10 md:px-6 md:py-12 lg:px-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/80">No code needed</p>
        <h2 id="offer-ladder" className="mt-1 font-playfair text-3xl font-bold md:text-4xl">
          Spend more, save more
        </h2>
        <p className="mt-1 text-sm text-white/80">Every reward is applied automatically in your bag.</p>

        <ol className="mt-6 grid gap-3 md:grid-cols-3 md:gap-5">
          {steps.map((step, i) => (
            <li
              key={step.label}
              className={`flex items-center gap-3 border p-4 ${
                step.reached ? "border-white bg-white text-primary" : "border-white/30 bg-white/5"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center text-sm font-bold ${
                  step.reached ? "bg-green-600 text-white" : "bg-white/15"
                }`}
              >
                {step.reached ? "✓" : i + 1}
              </span>
              <span>
                <span className={`block text-xs font-medium ${step.reached ? "text-gray-500" : "text-white/70"}`}>{step.label}</span>
                <span className="block text-base font-bold leading-tight">{step.reward}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm font-medium">
            {subtotal > 0 && next
              ? `Your bag is ₹${Math.round(subtotal)} — add ₹${Math.ceil(next.minimum - subtotal)} more for ${next.percent}% OFF.`
              : subtotal > 0
                ? `Your bag has every reward unlocked, including ${CLUB_VIORA_PLUS_PERCENT}% OFF.`
                : `Most shoppers pick 2–3 pieces — two sets usually cross ₹${CLUB_VIORA_MINIMUM}.`}
          </p>
          {subtotal > 0 ? (
            <button
              type="button"
              onClick={() => openDrawer()}
              className="bg-white px-6 py-3 text-sm font-bold uppercase tracking-wider text-accent hover:bg-platinum"
            >
              View my bag
            </button>
          ) : (
            <Link
              href="#best-sellers"
              className="bg-white px-6 py-3 text-center text-sm font-bold uppercase tracking-wider text-accent hover:bg-platinum"
            >
              Start with best sellers
            </Link>
          )}
        </div>
      </div>
    </section>
  );
};

export default OfferLadderBanner;
