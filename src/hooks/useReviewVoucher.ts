"use client";

import { useEffect, useRef, useState } from "react";
import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";
import { useCommerceUi } from "@/hooks/useCommerceUi";
import { REVIEW_REWARD, CLUB_VIORA_MINIMUM } from "@/lib/checkoutPricing";

// Off until the review loop goes live. When unset the hook is a pure no-op, so
// this can ship safely alongside the dormant WhatsApp review-capture flow.
const ENABLED = process.env.NEXT_PUBLIC_REVIEW_VOUCHER_ENABLED === "1";

const isValidMobile = (p: string) => /^[6-9]\d{9}$/.test(p);
const isValidEmail = (e: string) => /^\S+@\S+\.\S+$/.test(e);

const couponCodeOn = (cart: any) =>
  String((cart?.appliedDiscounts || []).find((d: any) => d.coupon)?.coupon?.code || "").toUpperCase();

/**
 * Auto-applies a customer's earned ₹75 photo-review voucher (PHOTO75) at
 * checkout — but ONLY while the subtotal sits in the window where it beats the
 * spend ladder: [REVIEW_REWARD.minimum, CLUB_VIORA_MINIMUM) i.e. ₹699–₹998.
 *
 * At ₹999+ the ladder (CLUBVIORA / CLUBVIORA15) gives more than ₹75, and Wix
 * allows only ONE coupon per order, so the voucher steps aside and is NOT
 * consumed — it waits for a smaller future order. Below ₹699 the coupon's own
 * minimum isn't met. This hook therefore OWNS the [699,999) window, where
 * useAutoLadderCoupon's target is null and it bails on our non-ladder code
 * (line "appliedCode && !COUPON_TIERS..."), so the two never fight.
 *
 * Eligibility is looked up server-side from the phone/email the shopper enters
 * (the voucher was granted when they posted a photo review). The server marks
 * it used (consumeReviewReward) only when an order is actually placed carrying
 * PHOTO75 — see src/app/api/wix/checkout/route.ts.
 */
export function useReviewVoucher(active: boolean, phone: string, email: string) {
  const wixClient = useWixClient();
  const cart = useCartStore((s) => s.cart);
  const shopperChoseCoupon = useCommerceUi((s) => s.shopperChoseCoupon);
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const checkedKey = useRef<string>("");
  const attemptRef = useRef<string>("");

  const lineItems = cart.lineItems || [];
  const subtotal = lineItems.reduce(
    (sum, li) => sum + (Number(li.price?.amount) || 0) * (li.quantity || 1),
    0
  );
  const appliedCode = couponCodeOn(cart);

  // 1) Look up eligibility whenever the shopper's identity (phone/email) changes.
  useEffect(() => {
    if (!ENABLED || !active) return;
    const p = phone.trim();
    const e = email.trim();
    if (!isValidMobile(p) && !isValidEmail(e)) {
      setEligible(false);
      return;
    }
    const key = `${p}|${e.toLowerCase()}`;
    if (checkedKey.current === key) return;
    checkedKey.current = key;

    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/review-reward/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: p, email: e }),
        });
        const j = await r.json().catch(() => ({}));
        if (!cancelled) setEligible(!!j?.eligible);
      } catch {
        if (!cancelled) setEligible(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, phone, email]);

  // 2) Apply / remove PHOTO75 as the bag total moves in and out of the window.
  useEffect(() => {
    if (!ENABLED || !active || busy || shopperChoseCoupon || lineItems.length === 0) return;

    const code = REVIEW_REWARD.code; // "PHOTO75"
    const inWindow = eligible && subtotal >= REVIEW_REWARD.minimum && subtotal < CLUB_VIORA_MINIMUM;
    const applied = appliedCode === code;

    if (inWindow && !applied) {
      // Guard so a coupon Wix refuses isn't retried forever for the same total.
      const attempt = `apply@${Math.round(subtotal)}`;
      if (attemptRef.current === attempt) return;
      attemptRef.current = attempt;
      (async () => {
        setBusy(true);
        await useCartStore.getState().applyCoupon(wixClient, code);
        setBusy(false);
      })();
    } else if (!inWindow && applied) {
      // Our voucher no longer fits (bag grew past the ladder, or shrank below the
      // minimum, or they became ineligible) — take it off so the ladder (or
      // nothing) can take over. Never consumed here; that happens on order.
      attemptRef.current = "";
      (async () => {
        setBusy(true);
        await useCartStore.getState().removeCoupon(wixClient);
        setBusy(false);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, eligible, subtotal, appliedCode, lineItems.length, shopperChoseCoupon, busy]);

  return { eligible, busy };
}
