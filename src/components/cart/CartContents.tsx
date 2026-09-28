"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { media as wixMedia } from "@wix/sdk";
import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";
import { useCommerceUi } from "@/hooks/useCommerceUi";
import { useWishlistStore } from "@/hooks/useWishlistStore";
import { deliveryWindowLabel } from "@/lib/deliveryEstimate";
import {
  automaticDiscountTotal,
  estimatedCouponTotal,
  useCartEstimate,
} from "@/hooks/useCartEstimate";
import { useAutoLadderCoupon } from "@/hooks/useAutoLadderCoupon";
import { useSocialProof } from "@/hooks/useSocialProof";
import { addUpsellToCart, useUpsellSuggestions, type UpsellSuggestion } from "@/hooks/useUpsellSuggestions";
import { trackMetaEvent } from "@/lib/metaEvents";
import { PRODUCT_PROOF_MIN } from "@/lib/socialProof";
import {
  COD_CHARGE,
  PREPAID_DISCOUNT,
  bestTierFor,
  fallbackCouponDiscount,
  nextTierFor,
} from "@/lib/checkoutPricing";
import { isServiceLine, lineTotal, lowStockLeft, rupees } from "@/lib/cartLines";
import ClubVioraProgress from "@/components/ClubVioraProgress";
import ScrollRow from "@/components/ScrollRow";
import FestiveCountdown from "@/components/FestiveCountdown";

type Props = {
  /** "drawer": single column with a pinned checkout bar. "page": two columns on desktop. */
  variant: "drawer" | "page";
  onCheckout: () => void;
  onContinueShopping?: () => void;
};

const thumbnail = (image: string | undefined, width: number, height: number) => {
  if (!image) return null;
  try {
    return wixMedia.getScaledToFillImageUrl(image, width, height, {});
  } catch {
    return null;
  }
};

const LockIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 11h14v10H5zM8 11V7a4 4 0 018 0v4" />
  </svg>
);

/**
 * The bag — shared by the slide-in drawer and the /cart page so both behave
 * identically: real savings, the spend ladder (applied automatically), pieces
 * that unlock the next step, low stock, a warning before a removal costs a
 * discount, undo, and one checkout button into the site-wide checkout modal.
 */
const CartContents = ({ variant, onCheckout, onContinueShopping }: Props) => {
  const wixClient = useWixClient();
  const {
    cart,
    isLoading,
    removeItem,
    updateQuantity,
    addItem,
    getCart,
    couponApplied,
    couponError,
    applyCoupon,
    removeCoupon,
    soldOutRemoved,
    dismissSoldOut,
  } = useCartStore();
  const { lastAddedId, autoAppliedCode, setShopperChoseCoupon, setAutoAppliedCode } = useCommerceUi();
  const estimate = useCartEstimate();
  const autoCoupon = useAutoLadderCoupon(true);
  const socialProof = useSocialProof();

  // Pieces that sold out while in the bag are taken out by the cart store.
  const soldOutBar = soldOutRemoved.length > 0 && (
    <div className="flex items-start justify-between gap-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
      <span>
        {soldOutRemoved.join(", ")} {soldOutRemoved.length === 1 ? "has" : "have"} just sold out, so we took{" "}
        {soldOutRemoved.length === 1 ? "it" : "them"} out of your bag.
      </span>
      <button type="button" onClick={dismissSoldOut} aria-label="Dismiss" className="font-bold">
        ✕
      </button>
    </div>
  );

  const [confirmRemove, setConfirmRemove] = useState<{ id: string; losses: string[] } | null>(null);
  const [undo, setUndo] = useState<{ name: string; catalogReference: any; quantity: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>();
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [showCouponInput, setShowCouponInput] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const lineItems: any[] = cart.lineItems || [];
  const productLines = lineItems.filter((li) => !isServiceLine(li));
  const subtotal = lineItems.reduce((sum, li) => sum + lineTotal(li), 0);
  const itemsSubtotal = productLines.reduce((sum, li) => sum + lineTotal(li), 0);
  const mrpSavings = productLines.reduce((sum, li) => {
    const full = Number(li.fullPrice?.amount) || Number(li.price?.amount) || 0;
    return sum + Math.max(0, full - (Number(li.price?.amount) || 0)) * (li.quantity || 1);
  }, 0);

  const appliedDiscounts = (cart as any)?.appliedDiscounts || [];
  const appliedCouponCode = appliedDiscounts.find((d: any) => d.coupon)?.coupon?.code || "";
  const cartCouponDiscount = appliedDiscounts.reduce((sum: number, d: any) => {
    if (!d.coupon) return sum;
    const reported = Number(d.coupon?.amount?.amount ?? d.discountAmount?.amount ?? 0);
    return sum + (reported > 0 ? reported : fallbackCouponDiscount(d.coupon.code, subtotal));
  }, 0);
  const couponDiscount = Math.max(estimatedCouponTotal(estimate), cartCouponDiscount);
  const automaticLines = estimate.lines.filter((l) => l.automatic);
  const automaticDiscount = automaticDiscountTotal(estimate);
  const discountedSubtotal = Math.max(0, subtotal - couponDiscount - automaticDiscount);
  const payOnlineTotal = Math.max(0, discountedSubtotal - PREPAID_DISCOUNT);
  const totalSavings = mrpSavings + couponDiscount + automaticDiscount;
  const next = nextTierFor(subtotal);
  const suggestions = useUpsellSuggestions({ subtotal, limit: 4 });
  const firstLowStock = productLines.find((li) => lowStockLeft(li) !== null);
  const wishlistItems = useWishlistStore((s) => s.items);

  // Uses the shopper's clock, so it's set after mount (no hydration mismatch).
  const [deliveryWindow, setDeliveryWindow] = useState("");
  useEffect(() => setDeliveryWindow(deliveryWindowLabel()), []);

  // Page variant: the phone's pinned checkout bar steps aside while the real button is on screen.
  const inlineCheckoutRef = useRef<HTMLDivElement>(null);
  const [inlineCheckoutVisible, setInlineCheckoutVisible] = useState(false);
  const hasItems = lineItems.length > 0;
  useEffect(() => {
    if (variant !== "page" || !hasItems || !inlineCheckoutRef.current) return;
    const observer = new IntersectionObserver(([entry]) => setInlineCheckoutVisible(entry.isIntersecting));
    observer.observe(inlineCheckoutRef.current);
    return () => observer.disconnect();
  }, [variant, hasItems]);

  // What a removal would cost the shopper — only real, computable losses.
  const lossesIfRemoved = (li: any): string[] => {
    const losses: string[] = [];
    const after = subtotal - lineTotal(li);
    const nowTier = bestTierFor(subtotal);
    const afterTier = bestTierFor(after);
    if (nowTier && nowTier.code !== afterTier?.code) {
      losses.push(
        afterTier
          ? `Your ${nowTier.percent}% OFF drops to ${afterTier.percent}%`
          : `Your ${nowTier.percent}% OFF (₹${Math.round((subtotal * nowTier.percent) / 100)})`
      );
    }
    if (!isServiceLine(li)) {
      if (automaticDiscount > 0 && productLines.length - 1 < 2) {
        losses.push(`Festive combo discount (₹${Math.round(automaticDiscount)})`);
      }
    }
    return losses;
  };

  const doRemove = async (li: any) => {
    setConfirmRemove(null);
    setBusyLine(li._id);
    try {
      await removeItem(wixClient, li._id);
      if (!isServiceLine(li)) {
        clearTimeout(undoTimer.current);
        setUndo({
          name: li.productName?.original || "Item",
          catalogReference: li.catalogReference,
          quantity: li.quantity || 1,
        });
        undoTimer.current = setTimeout(() => setUndo(null), 6000);
      }
    } catch (err) {
      console.error("[bag] remove failed:", err);
    } finally {
      setBusyLine(null);
    }
  };

  const requestRemove = (li: any) => {
    const losses = lossesIfRemoved(li);
    if (losses.length) setConfirmRemove({ id: li._id, losses });
    else doRemove(li);
  };

  const undoRemove = async () => {
    if (!undo) return;
    const restore = undo;
    setUndo(null);
    try {
      await wixClient.currentCart.addToCurrentCart({
        lineItems: [{ catalogReference: restore.catalogReference, quantity: restore.quantity }],
      } as any);
      await getCart(wixClient);
    } catch (err) {
      console.error("[bag] undo failed:", err);
    }
  };

  const changeQuantity = async (li: any, quantity: number) => {
    if (quantity < 1) {
      requestRemove(li);
      return;
    }
    setBusyLine(li._id);
    try {
      await updateQuantity(wixClient, li._id, quantity);
    } catch (err) {
      console.error("[bag] quantity update failed:", err);
    } finally {
      setBusyLine(null);
    }
  };

  const addSuggestion = async (suggestion: UpsellSuggestion) => {
    setAddingId(suggestion.id);
    try {
      await addUpsellToCart(wixClient, addItem, suggestion);
    } catch (err) {
      console.error("[bag] add suggestion failed:", err);
    } finally {
      setAddingId(null);
    }
  };

  const applyTypedCode = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setShopperChoseCoupon(true);
    setAutoAppliedCode("");
    setApplyingCoupon(true);
    await applyCoupon(wixClient, code);
    setApplyingCoupon(false);
    setCouponCode("");
  };

  const removeAppliedCode = async () => {
    setShopperChoseCoupon(true);
    setAutoAppliedCode("");
    setApplyingCoupon(true);
    await removeCoupon(wixClient);
    setApplyingCoupon(false);
  };

  const startCheckout = () => {
    trackMetaEvent("InitiateCheckout", {
      currency: "INR",
      value: subtotal,
      content_ids: productLines
        .map((li) => li.catalogReference?.catalogItemId)
        .filter((id): id is string => !!id),
      content_type: "product",
      contents: productLines.map((li) => ({
        id: li.catalogReference?.catalogItemId || li._id || "",
        quantity: li.quantity || 1,
        item_price: Number(li.price?.amount) || 0,
      })),
      num_items: productLines.reduce((sum, li) => sum + (li.quantity || 1), 0),
    });
    onCheckout();
  };

  const suggestionRail = (title: string) =>
    suggestions.length > 0 && (
      <section>
        <h3 className="font-inter mb-2 text-xs font-semibold uppercase tracking-wider text-primary">{title}</h3>
        <ScrollRow className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide">
          {suggestions.map((s) => (
            <div key={s.id} className="w-32 shrink-0 snap-start border border-gray-200 bg-white">
              <Link href={`/${s.slug}`} onClick={onContinueShopping} className="relative block aspect-square bg-gray-50">
                {s.image && <Image src={s.image} alt={s.name} fill sizes="128px" quality={60} className="object-cover" />}
                {s.unlocksTier && (
                  <span className="absolute left-1.5 top-1.5 bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    Unlocks {s.unlocksTier.percent}% off
                  </span>
                )}
              </Link>
              <div className="p-2">
                <p className="line-clamp-1 text-[11px] text-primary">{s.name}</p>
                <p className="text-xs font-bold text-primary">
                  ₹{s.price}
                  {s.compareAt && (
                    <span className="ml-1 text-[10px] font-normal text-gray-400 line-through">₹{s.compareAt}</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => addSuggestion(s)}
                  disabled={!!addingId}
                  className="mt-1.5 h-8 w-full border border-primary text-[11px] font-semibold uppercase tracking-wide text-primary transition-colors hover:bg-primary hover:text-white disabled:opacity-50"
                >
                  {addingId === s.id ? "Adding…" : "+ Add"}
                </button>
              </div>
            </div>
          ))}
        </ScrollRow>
      </section>
    );

  // ---- Empty bag ----
  if (lineItems.length === 0) {
    return (
      <div className={variant === "drawer" ? "min-h-0 flex-1 overflow-y-auto p-4" : "py-6"}>
        {soldOutBar}
        <div className="py-10 text-center">
          <p className="text-4xl" aria-hidden="true">
            🛍️
          </p>
          <p className="mt-2 font-playfair text-2xl font-bold text-primary">Your bag is empty</p>
          <p className="mt-1 text-sm text-gray-500">Pieces you add will show up here.</p>
          <Link
            href="/list"
            onClick={onContinueShopping}
            className="mt-5 inline-block rounded-lg bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-wider text-white"
          >
            Start shopping
          </Link>
        </div>
        {wishlistItems.length > 0 && (
          <Link
            href="/wishlist"
            onClick={onContinueShopping}
            className="mb-6 flex items-center gap-3 border border-accent/30 bg-accent/5 p-3 hover:border-accent"
          >
            <span className="flex shrink-0 -space-x-3">
              {wishlistItems.slice(0, 3).map((item) => (
                <span key={item.id} className="relative h-11 w-11 overflow-hidden rounded-full border-2 border-white bg-gray-100">
                  {item.image && <Image src={item.image} alt="" fill sizes="44px" className="object-cover" />}
                </span>
              ))}
            </span>
            <span className="min-w-0 flex-1 text-sm text-primary">
              <b>
                You saved {wishlistItems.length} {wishlistItems.length === 1 ? "piece" : "pieces"}
              </b>
              <span className="block text-xs text-gray-500">Add them to your bag from your wishlist</span>
            </span>
            <span aria-hidden="true" className="text-accent">
              →
            </span>
          </Link>
        )}
        {suggestionRail("Popular right now")}
      </div>
    );
  }

  const savingsHero = (
    <>
      {totalSavings > 0 && (
        <div className="bg-green-50 px-4 py-2.5 text-center">
          <p className="text-sm font-bold text-green-800">🎉 You&apos;re saving ₹{Math.round(totalSavings)}</p>
          {autoAppliedCode && (
            <p className="text-[11px] font-medium text-green-700">{autoAppliedCode} applied for you</p>
          )}
        </div>
      )}
      <FestiveCountdown />
    </>
  );

  const undoBar = undo && (
    <div className="flex items-center justify-between bg-primary px-3 py-2 text-xs text-white" role="status">
      <span className="truncate">Removed {undo.name}</span>
      <button type="button" onClick={undoRemove} className="ml-3 font-bold uppercase tracking-wider text-amber-300">
        Undo
      </button>
    </div>
  );

  const itemsList = (
    <ul className="divide-y divide-gray-100">
      {lineItems.map((li) => {
        const src = thumbnail(li.image, 160, 200);
        const qty = li.quantity || 1;
        const price = Number(li.price?.amount) || 0;
        const full = Number(li.fullPrice?.amount) || 0;
        const left = lowStockLeft(li);
        const stockCap = li.availability?.quantityAvailable;
        const ordersThisWeek = socialProof.byProduct[li.catalogReference?.catalogItemId] || 0;
        const justAdded = !!lastAddedId && li.catalogReference?.catalogItemId === lastAddedId;
        const service = isServiceLine(li);
        const busy = busyLine === li._id;
        return (
          <li key={li._id} className={`py-4 ${justAdded ? "-mx-2 bg-green-50/70 px-2" : ""}`}>
            <div className="flex gap-3">
              <div className="relative flex h-24 w-20 shrink-0 items-center justify-center bg-gray-100 text-2xl">
                {src ? <Image src={src} alt="" fill sizes="80px" className="object-cover" /> : "🎁"}
              </div>
              <div className="min-w-0 flex-1">
                {justAdded && (
                  <p className="text-[11px] font-bold uppercase tracking-wider text-green-700">✓ Just added</p>
                )}
                <p className="line-clamp-2 text-sm font-medium text-primary">{li.productName?.original}</p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="text-sm font-bold text-primary">₹{rupees(price)}</span>
                  {full > price && <span className="text-xs text-gray-400 line-through">₹{rupees(full)}</span>}
                </p>
                {left !== null && (
                  <p className="mt-1 text-[11px] font-semibold text-orange-600">⚠ Only {left} left in stock</p>
                )}
                {ordersThisWeek >= PRODUCT_PROOF_MIN && (
                  <p className="mt-0.5 text-[11px] text-gray-500">🔥 Ordered {ordersThisWeek} times this week</p>
                )}
                <div className="mt-2 flex items-center justify-between">
                  {service ? (
                    <span className="text-xs text-gray-500">Qty 1</span>
                  ) : (
                    <div className="flex h-8 items-center border border-gray-300">
                      <button
                        type="button"
                        onClick={() => changeQuantity(li, qty - 1)}
                        disabled={busy}
                        aria-label="Decrease quantity"
                        className="h-full w-8 text-primary disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="w-7 text-center text-sm font-semibold tabular-nums text-primary">{qty}</span>
                      <button
                        type="button"
                        onClick={() => changeQuantity(li, qty + 1)}
                        disabled={busy || (typeof stockCap === "number" && qty >= stockCap)}
                        aria-label="Increase quantity"
                        className="h-full w-8 text-primary disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => requestRemove(li)}
                    disabled={busy}
                    className="text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-red-600 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>

            {confirmRemove?.id === li._id && (
              <div className="mt-3 border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">
                <p className="font-semibold">Removing this means losing:</p>
                <ul className="mt-1 list-disc pl-4">
                  {confirmRemove?.losses.map((loss) => (
                    <li key={loss}>{loss}</li>
                  ))}
                </ul>
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(null)}
                    className="flex-1 bg-accent py-2 text-[11px] font-bold uppercase tracking-wider text-white"
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    onClick={() => doRemove(li)}
                    className="flex-1 border border-red-300 py-2 text-[11px] font-semibold uppercase tracking-wider text-red-700"
                  >
                    Remove anyway
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  const railTitle =
    next && suggestions.some((s) => s.unlocksTier)
      ? `Add ₹${Math.ceil(next.minimum - subtotal)} more to unlock ${next.percent}% OFF`
      : "Add to your order";

  const summary = (
    <div className="space-y-3">
      <ClubVioraProgress
        subtotal={subtotal}
        appliedCode={couponApplied ? appliedCouponCode : ""}
        applying={applyingCoupon || autoCoupon.busy}
        onApply={async (code) => {
          setShopperChoseCoupon(false);
          setApplyingCoupon(true);
          await applyCoupon(wixClient, code);
          setApplyingCoupon(false);
        }}
      />

      {couponApplied && appliedCouponCode ? (
        <div className="flex items-center justify-between gap-2 border border-green-200 bg-green-50/60 px-3 py-2">
          <p className="min-w-0 truncate text-xs font-semibold text-green-800">
            ✓ {appliedCouponCode} applied
            {couponDiscount > 0 && <span className="font-normal text-green-700"> · you save ₹{rupees(couponDiscount)}</span>}
          </p>
          <button
            type="button"
            onClick={removeAppliedCode}
            disabled={applyingCoupon}
            className="text-[11px] font-semibold uppercase tracking-wider text-red-600 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ) : !showCouponInput ? (
        <button
          type="button"
          onClick={() => setShowCouponInput(true)}
          className="text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-accent"
        >
          Have a different coupon code?
        </button>
      ) : (
        <div>
          <div className="flex gap-2">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyTypedCode();
                }
              }}
              placeholder="ENTER CODE"
              autoFocus
              className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-base uppercase tracking-wider outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="button"
              onClick={applyTypedCode}
              disabled={applyingCoupon || !couponCode.trim()}
              className="rounded-md bg-accent px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-white disabled:opacity-50"
            >
              {applyingCoupon ? "…" : "Apply"}
            </button>
          </div>
          {couponError && <p className="mt-1.5 text-[11px] text-red-600">{couponError}</p>}
        </div>
      )}

      <div className="space-y-1.5 border border-gray-100 bg-gray-50 p-3 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Subtotal</span>
          <span className="tabular-nums">₹{rupees(subtotal)}</span>
        </div>
        {couponDiscount > 0 && (
          <div className="flex justify-between font-medium text-green-700">
            <span>Coupon{appliedCouponCode ? ` (${appliedCouponCode})` : ""}</span>
            <span className="tabular-nums">- ₹{rupees(couponDiscount)}</span>
          </div>
        )}
        {automaticLines.map((line) => (
          <div key={line.label} className="flex justify-between font-medium text-green-700">
            <span>{line.label}</span>
            <span className="tabular-nums">- ₹{rupees(line.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between text-gray-600">
          <span>Delivery</span>
          <span className="text-right text-xs">
            <span className="font-semibold text-green-700">FREE paying online</span>
            <span className="block text-gray-500">₹{COD_CHARGE} with cash on delivery</span>
          </span>
        </div>
        <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-primary">
          <span>Total</span>
          <span className="tabular-nums">₹{rupees(discountedSubtotal)}</span>
        </div>
        <p className="text-xs font-semibold text-green-700">
          Pay online at checkout: ₹{rupees(payOnlineTotal)} (extra ₹{PREPAID_DISCOUNT} off)
        </p>
        {deliveryWindow && (
          <p className="border-t border-gray-200 pt-2 text-xs text-gray-600">
            🚚 Order now, get it <b className="text-primary">{deliveryWindow}</b>
          </p>
        )}
      </div>
    </div>
  );

  const checkoutButton = (
    <div>
      {firstLowStock && (
        <p className="mb-2 text-center text-[11px] font-semibold text-orange-700">
          ⚠ Only {lowStockLeft(firstLowStock)} left of {firstLowStock.productName?.original} — check out to get yours
        </p>
      )}
      <button
        type="button"
        onClick={startCheckout}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3.5 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-accent/90"
      >
        <LockIcon />
        Checkout · ₹{rupees(payOnlineTotal)}
      </button>
      <p className="mt-2 text-center text-[11px] text-gray-500">
        UPI · Cards · Cash on delivery · 48-hr exchange
      </p>
    </div>
  );

  if (variant === "drawer") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {savingsHero}
          <div className="space-y-5 p-4">
            {soldOutBar}
            {undoBar}
            {itemsList}
            {suggestionRail(railTitle)}
            {summary}
          </div>
        </div>
        <div className="border-t border-gray-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-6px_16px_rgba(0,0,0,0.06)]">
          {checkoutButton}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          {savingsHero}
          {soldOutBar}
          {undoBar}
          {itemsList}
          {suggestionRail(railTitle)}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          {summary}
          <div ref={inlineCheckoutRef} className={isLoading ? "opacity-90" : ""}>
            {checkoutButton}
          </div>
        </aside>
      </div>

      {/* Phone: the checkout button stays in reach above the bottom nav (until the real one scrolls into view) */}
      <div
        aria-hidden={inlineCheckoutVisible}
        className={`fixed inset-x-0 bottom-16 z-40 border-t border-gray-100 bg-white px-4 py-3 shadow-[0_-6px_16px_rgba(0,0,0,0.08)] transition-transform duration-200 md:hidden ${
          inlineCheckoutVisible ? "pointer-events-none translate-y-[calc(100%+4rem)]" : ""
        }`}
      >
        <button
          type="button"
          onClick={startCheckout}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm font-bold uppercase tracking-wider text-white"
        >
          <LockIcon />
          Checkout · ₹{rupees(payOnlineTotal)}
        </button>
      </div>
    </>
  );
};

export default CartContents;
