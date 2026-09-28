"use client";

import { useCartStore } from "@/hooks/useCartStore";
import { useCommerceUi } from "@/hooks/useCommerceUi";
import {
  CLUB_VIORA_MINIMUM,
  CLUB_VIORA_PERCENT,
  CLUB_VIORA_PLUS_MINIMUM,
  CLUB_VIORA_PLUS_PERCENT,
  nextTierFor,
} from "@/lib/checkoutPricing";
import { isServiceLine, lineTotal } from "@/lib/cartLines";

/**
 * The spend ladder as one full-width row inside the product grid. With a bag it
 * shows the exact gap to the next reward and a progress bar (goal gradient);
 * without one it states both steps.
 */
const OfferLadderTile = () => {
  const { cart } = useCartStore();
  const openDrawer = useCommerceUi((s) => s.openDrawer);
  const lines = (cart.lineItems || []).filter((li) => !isServiceLine(li));
  const subtotal = lines.reduce((sum, li) => sum + lineTotal(li), 0);
  const next = nextTierFor(subtotal);
  const target = next?.minimum || CLUB_VIORA_PLUS_MINIMUM;
  const progress = Math.min(100, Math.round((subtotal / target) * 100));

  return (
    <div className="flex flex-col gap-3 bg-accent px-4 py-4 text-white md:flex-row md:items-center md:justify-between md:px-6">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">Spend more, save more · no code needed</p>
        {subtotal > 0 && next ? (
          <p className="mt-1 text-base font-bold leading-snug md:text-lg">
            Add ₹{Math.ceil(next.minimum - subtotal)} more for {next.percent}% OFF
          </p>
        ) : subtotal > 0 ? (
          <p className="mt-1 text-base font-bold leading-snug md:text-lg">
            You&apos;ve unlocked {CLUB_VIORA_PLUS_PERCENT}% OFF
          </p>
        ) : (
          <p className="mt-1 text-base font-bold leading-snug md:text-lg">
            {CLUB_VIORA_PERCENT}% OFF on ₹{CLUB_VIORA_MINIMUM}+ · {CLUB_VIORA_PLUS_PERCENT}% OFF on ₹
            {CLUB_VIORA_PLUS_MINIMUM.toLocaleString("en-IN")}+
          </p>
        )}
        {subtotal > 0 && next && (
          <div className="mt-2 h-1.5 w-full max-w-sm bg-white/20" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next reward">
            <div className="h-full bg-white" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      {subtotal > 0 ? (
        <button
          type="button"
          onClick={() => openDrawer()}
          className="shrink-0 self-start bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-accent hover:bg-platinum md:self-auto"
        >
          View bag · ₹{Math.round(subtotal)}
        </button>
      ) : (
        <p className="shrink-0 text-xs text-white/80">Two pieces usually cross ₹{CLUB_VIORA_MINIMUM}.</p>
      )}
    </div>
  );
};

export default OfferLadderTile;
