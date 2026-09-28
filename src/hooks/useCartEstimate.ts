"use client";

import { useEffect, useState } from "react";
import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";

export type CartDiscountLine = {
  label: string;
  amount: number;
  /** An automatic Wix discount rule (e.g. the festive combo), not a typed coupon. */
  automatic: boolean;
};

export type CartEstimate = {
  lines: CartDiscountLine[];
  /** False while an estimate for the current cart is still loading. */
  ready: boolean;
};

/**
 * Wix's own discount breakdown for the current cart — coupons AND automatic
 * discount rules, which the cart object alone doesn't price. Anything that
 * charges money should wait for `ready`, so the figure always matches the cart.
 */
export function useCartEstimate(enabled = true): CartEstimate {
  const wixClient = useWixClient();
  const cart = useCartStore((s) => s.cart);
  const [estimate, setEstimate] = useState<CartEstimate>({ lines: [], ready: false });

  // Re-estimate only when what's being priced actually changes.
  const signature = JSON.stringify([
    (cart.lineItems || []).map((li) => [li._id, li.quantity]),
    ((cart as any).appliedDiscounts || []).map((d: any) => d.coupon?.code || ""),
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (!cart.lineItems?.length) {
      setEstimate({ lines: [], ready: true });
      return;
    }
    let cancelled = false;
    setEstimate((prev) => ({ ...prev, ready: false }));
    wixClient.currentCart
      .estimateCurrentCartTotals({})
      .then((res: any) => {
        if (cancelled) return;
        const lines: CartDiscountLine[] = (res?.appliedDiscounts || [])
          .map((d: any) => ({
            label: d.coupon
              ? `Coupon (${d.coupon.code || d.coupon.name || ""})`
              : d.discountRule?.name?.translated || d.discountRule?.name?.original || "Discount",
            amount:
              Number(
                d.coupon?.amount?.amount ??
                  d.discountRule?.amount?.amount ??
                  d.merchantDiscount?.amount?.amount ??
                  0
              ) || 0,
            automatic: !d.coupon,
          }))
          .filter((line: CartDiscountLine) => line.amount > 0);
        setEstimate({ lines, ready: true });
      })
      .catch((err: unknown) => {
        // Callers fall back to their coupon maths when no lines come back.
        console.warn("[cart estimate] failed:", err);
        if (!cancelled) setEstimate({ lines: [], ready: true });
      });
    return () => {
      cancelled = true;
    };
    // `signature` captures every cart change that affects pricing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, signature, wixClient]);

  return estimate;
}

/** Sum of the automatic (non-coupon) discounts in an estimate. */
export const automaticDiscountTotal = (estimate: CartEstimate) =>
  estimate.lines.filter((l) => l.automatic).reduce((sum, l) => sum + l.amount, 0);

/** The coupon amount Wix estimated, if any. */
export const estimatedCouponTotal = (estimate: CartEstimate) =>
  estimate.lines.filter((l) => !l.automatic).reduce((sum, l) => sum + l.amount, 0);
