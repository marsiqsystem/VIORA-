"use client";

import { COUPON_TIERS, bestTierFor, nextTierFor } from "@/lib/checkoutPricing";

type Props = {
  /** Real cart items total (not any display-only figure). */
  subtotal: number;
  appliedCode?: string;
  /** Applies the given ladder code to the cart. */
  onApply?: (code: string) => void;
  applying?: boolean;
  className?: string;
};

/**
 * Spend ladder — CLUBVIORA (10%) then CLUBVIORA15 (15%).
 * Always-visible progress toward the next step, with a one-tap Apply for the
 * best code the cart qualifies for. Hidden once the top step's code is applied.
 */
const ClubVioraProgress = ({ subtotal, appliedCode = "", onApply, applying = false, className = "" }: Props) => {
  const top = COUPON_TIERS[COUPON_TIERS.length - 1];
  const applied = appliedCode.toUpperCase();
  if (applied === top.code) return null;

  const best = bestTierFor(subtotal);
  const next = nextTierFor(subtotal);
  const progress = Math.min(100, Math.round((subtotal / top.minimum) * 100));

  return (
    <div className={`rounded-lg border border-dashed border-accent/40 bg-accent/5 p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-primary">
          {next ? (
            <>
              Add <b>₹{Math.ceil(next.minimum - subtotal)}</b> more for <b>{next.percent}% OFF</b>
            </>
          ) : (
            <>
              🎉 Unlocked: <b>{top.percent}% OFF</b>
            </>
          )}
        </p>
        {best && best.code !== applied && onApply && (
          <button
            type="button"
            onClick={() => onApply(best.code)}
            disabled={applying}
            className="shrink-0 rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {applying ? "…" : `Apply ${best.code}`}
          </button>
        )}
      </div>

      <div className="relative mt-2 h-1.5 rounded-full bg-accent/15" aria-hidden="true">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
        {COUPON_TIERS.slice(0, -1).map((t) => (
          <span
            key={t.code}
            className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-accent"
            style={{ left: `${(t.minimum / top.minimum) * 100}%` }}
          />
        ))}
      </div>

      <div className="mt-1.5 flex justify-between gap-2 text-[10px] text-gray-500">
        {COUPON_TIERS.map((t) => (
          <span key={t.code} className={subtotal >= t.minimum ? "font-semibold text-accent" : ""}>
            ₹{t.minimum}: {t.percent}% · {t.code}
          </span>
        ))}
      </div>
    </div>
  );
};

export default ClubVioraProgress;
