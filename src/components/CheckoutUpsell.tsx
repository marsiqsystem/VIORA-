"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";
import { addUpsellToCart, useUpsellSuggestions } from "@/hooks/useUpsellSuggestions";
import { isGiftWrapLine } from "@/lib/cartLines";

type Props = {
  /** Cart subtotal as Wix prices it (what coupon minimums are checked against). */
  subtotal: number;
  /** Coupon discount currently applied, to show the *extra* saving. */
  couponDiscount: number;
};

/** Checkout add-on: the one piece that best closes the gap to the next ladder step. */
const CheckoutUpsell = ({ subtotal, couponDiscount }: Props) => {
  const wixClient = useWixClient();
  const { cart, addItem, getCart } = useCartStore();
  const [busy, setBusy] = useState(false);
  const removingWrap = useRef(false);
  const suggestion = useUpsellSuggestions({ subtotal, limit: 1 }).find((s) => s.unlocksTier);

  const lineItems: any[] = cart.lineItems || [];
  const wrapLine = lineItems.find(isGiftWrapLine);

  // Gift wrap is no longer offered: drop a paid wrap line left in an older bag
  // so it isn't charged.
  useEffect(() => {
    if (!wrapLine?._id || removingWrap.current) return;
    removingWrap.current = true;
    wixClient.currentCart
      .removeLineItemsFromCurrentCart([wrapLine._id])
      .then(() => getCart(wixClient))
      .catch((err) => console.error("[checkout upsell] removing paid wrap failed:", err))
      .finally(() => {
        removingWrap.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrapLine?._id]);

  const addSuggestion = async () => {
    if (!suggestion || busy) return;
    setBusy(true);
    try {
      await addUpsellToCart(wixClient, addItem, suggestion);
    } catch (err) {
      console.error("[checkout upsell] add failed:", err);
    } finally {
      setBusy(false);
    }
  };

  if (!suggestion) return null;

  const tier = suggestion?.unlocksTier;
  const extraSaving =
    suggestion && tier
      ? Math.max(0, Math.round(((subtotal + suggestion.price) * tier.percent) / 100 - couponDiscount))
      : 0;

  return (
    <div className="space-y-2.5">
      {suggestion && tier && (
        <div className="flex items-center gap-3 border border-accent/30 bg-accent/5 p-2.5">
          <div className="relative h-14 w-14 shrink-0 bg-white">
            {suggestion.image && (
              <Image src={suggestion.image} alt={suggestion.name} fill sizes="56px" className="object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
              Unlock {tier.percent}% OFF
            </p>
            <p className="truncate text-xs font-medium text-primary">{suggestion.name}</p>
            <p className="text-[11px] text-gray-600">
              ₹{suggestion.price} · takes ₹{extraSaving} more off your order
            </p>
          </div>
          <button
            type="button"
            onClick={addSuggestion}
            disabled={busy}
            className="shrink-0 rounded-md bg-accent px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white disabled:opacity-60"
          >
            {busy ? "Adding…" : "+ Add"}
          </button>
        </div>
      )}
    </div>
  );
};

export default CheckoutUpsell;
