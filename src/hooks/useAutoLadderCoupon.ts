"use client";

import { useEffect, useState } from "react";
import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";
import { useCommerceUi } from "@/hooks/useCommerceUi";
import { COUPON_TIERS, bestTierFor } from "@/lib/checkoutPricing";

const couponCodeOn = (cart: any) =>
  String((cart?.appliedDiscounts || []).find((d: any) => d.coupon)?.coupon?.code || "").toUpperCase();

/**
 * Keeps the best spend-ladder coupon on the cart automatically — nobody should
 * have to hunt for CLUBVIORA. Upgrades to CLUBVIORA15 as the bag grows, removes
 * a ladder code the bag no longer qualifies for, never touches a code the
 * shopper chose, and hides the error when a code isn't set up in Wix yet (not
 * the shopper's mistake). Shared by the bag and checkout.
 */
export function useAutoLadderCoupon(enabled: boolean) {
  const wixClient = useWixClient();
  const cart = useCartStore((s) => s.cart);
  const shopperChoseCoupon = useCommerceUi((s) => s.shopperChoseCoupon);
  const [busy, setBusy] = useState(false);

  const lineItems = cart.lineItems || [];
  const subtotal = lineItems.reduce(
    (sum, li) => sum + (Number(li.price?.amount) || 0) * (li.quantity || 1),
    0
  );
  const appliedCode = couponCodeOn(cart);

  useEffect(() => {
    if (!enabled || busy || shopperChoseCoupon || lineItems.length === 0) return;
    if (appliedCode && !COUPON_TIERS.some((t) => t.code === appliedCode)) return;

    const target = bestTierFor(subtotal)?.code || "";
    if (target === appliedCode) return;

    const ui = useCommerceUi.getState();
    const attempt = `${target}@${Math.round(subtotal)}`;
    if (ui.autoCouponAttempt === attempt) return;
    ui.setAutoCouponAttempt(attempt);

    (async () => {
      setBusy(true);
      const { applyCoupon, removeCoupon } = useCartStore.getState();
      if (target) {
        // Best step first, then the lower ones — if CLUBVIORA15 isn't set up in
        // Wix yet, the shopper still gets CLUBVIORA instead of nothing.
        const candidates = [...COUPON_TIERS].reverse().filter((t) => subtotal >= t.minimum);
        let applied = "";
        for (const tier of candidates) {
          if (tier.code === appliedCode) {
            applied = tier.code;
            break;
          }
          await applyCoupon(wixClient, tier.code);
          if (couponCodeOn(useCartStore.getState().cart) === tier.code) {
            applied = tier.code;
            break;
          }
        }
        if (applied) ui.setAutoAppliedCode(applied);
        useCartStore.setState({ couponError: "" });
      } else {
        await removeCoupon(wixClient);
        ui.setAutoAppliedCode("");
      }
      setBusy(false);
    })();
    // Re-evaluated whenever the bag total or the applied code changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, subtotal, appliedCode, lineItems.length, shopperChoseCoupon]);

  return { busy };
}
