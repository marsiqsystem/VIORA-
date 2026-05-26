"use client";

import Image from "next/image";
import { useCartStore } from "@/hooks/useCartStore";
import { media as wixMedia } from "@wix/sdk";
import { useWixClient } from "@/hooks/useWixClient";
import { trackMetaEvent } from "@/lib/metaEvents";
import Link from "next/link";
// import GiftWrapUpsell from "./GiftWrapUpsell"; // Gift wrap upsell paused — see banner comment below.
import { useEffect, useRef, useState } from "react";
import nextDynamic from "next/dynamic";

// Defer the heavy CheckoutModal — only loaded when ORDER NOW is clicked.
const CheckoutModal = nextDynamic(() => import("./CheckoutModal"), { ssr: false });

const CLUB_VIORA_CODE = "CLUBVIORA";
const CLUB_VIORA_MINIMUM = 999;
const SHINE_50_CODE = "SHINE50";
const SHINE_50_MINIMUM = 700;
const SHINE_50_DISCOUNT = 50;

const CartModal = () => {
  const wixClient = useWixClient();
  const { cart, isLoading, removeItem, couponApplied, couponError, applyCoupon, removeCoupon } = useCartStore();
  const cartModalRef = useRef<HTMLDivElement>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [showCouponInput, setShowCouponInput] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [removingCoupon, setRemovingCoupon] = useState(false);

  useEffect(() => {
    cartModalRef.current?.scrollTo({ top: 0 });
  }, [cart.lineItems?.length]);

  useEffect(() => {
    const cartModal = cartModalRef.current;
    if (!cartModal) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      cartModal.scrollTop += event.deltaY;
    };

    cartModal.addEventListener("wheel", handleWheel, { passive: false });
    return () => cartModal.removeEventListener("wheel", handleWheel);
  }, []);

  const handleCheckout = async () => {
    try {
      const lineItems = cart.lineItems || [];
      trackMetaEvent("InitiateCheckout", {
        currency: "INR",
        value: lineItems.reduce(
          (sum, item) =>
            sum + (Number(item.price?.amount) || 0) * (item.quantity || 1),
          0
        ),
        content_ids: lineItems
          .map((item) => item.catalogReference?.catalogItemId)
          .filter((id): id is string => !!id),
        content_type: "product",
        contents: lineItems.map((item) => ({
          id: item.catalogReference?.catalogItemId || item._id || "",
          quantity: item.quantity || 1,
          item_price: Number(item.price?.amount) || 0,
        })),
        num_items: lineItems.reduce(
          (sum, item) => sum + (item.quantity || 1),
          0
        ),
      });

      setCheckoutOpen(true);
    } catch (err) {
      console.log(err);
    }
  };

  // Calculate subtotal
  const subtotal = cart.lineItems?.reduce((total, item) => {
    return total + (Number(item.price?.amount) || 0) * (item.quantity || 1);
  }, 0) || 0;

  const mrpSavings = cart.lineItems?.reduce((savings, item) => {
    const fullPrice = Number(item.fullPrice?.amount) || Number(item.price?.amount) || 0;
    const currentPrice = Number(item.price?.amount) || 0;
    return savings + (fullPrice - currentPrice) * (item.quantity || 1);
  }, 0) || 0;

  // Shipping ₹99 + Processing ₹50 = ₹149 base savings. Prepaid bonus shown inside checkout modal.
  const totalSavings = 149 + mrpSavings;

  // Display-only inflated subtotal — frontend optics only. `subtotal` (the real
  // cart items total) is what's used for backend / payment-gateway amounts.
  const displaySubtotal = subtotal + 99 + 50;

  // Coupon-derived values.
  const appliedDiscounts = (cart as any)?.appliedDiscounts || [];
  const appliedCoupon = appliedDiscounts.find((d: any) => d.coupon);
  const appliedCouponCode = appliedCoupon?.coupon?.code || "";
  const wixCouponDiscount = appliedDiscounts.reduce((sum: number, d: any) => {
    if (!d.coupon) return sum;
    const reported = Number(d.coupon?.amount?.amount ?? d.discountAmount?.amount ?? 0);
    if (reported > 0) return sum + reported;
    const couponCode = d.coupon.code?.toUpperCase();
    if (couponCode === CLUB_VIORA_CODE && subtotal >= CLUB_VIORA_MINIMUM) {
      return sum + subtotal * 0.1;
    }
    // SHINE50: flat ₹50 off on orders ≥ ₹700 (matches the Wix coupon rules).
    if (couponCode === "SHINE50" && subtotal >= 700) {
      return sum + 50;
    }
    return sum;
  }, 0);
  const amountToUnlockCoupon = Math.max(0, CLUB_VIORA_MINIMUM - subtotal);
  const amountToUnlockShine = Math.max(0, SHINE_50_MINIMUM - subtotal);
  const estimatedTotal = Math.max(0, subtotal - wixCouponDiscount);

  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setApplyingCoupon(true);
    await applyCoupon(wixClient, code);
    setApplyingCoupon(false);
    setCouponCode("");
  };

  const handleRemoveCoupon = async () => {
    setRemovingCoupon(true);
    await removeCoupon(wixClient);
    setRemovingCoupon(false);
    setShowCouponInput(false);
  };

  return (
    <div
      ref={cartModalRef}
      data-cart-modal
      className="absolute top-12 right-0 z-20 flex max-h-[calc(100vh-6rem)] w-[min(400px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-col gap-6 overflow-y-auto overscroll-contain rounded-xl border border-gray-100 bg-white p-4 shadow-xl [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent"
      onTouchMove={(event) => event.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-primary">Shopping Cart</h2>
        {cart.lineItems && cart.lineItems.length > 0 && (
          <span className="text-sm text-gray-500">
            {cart.lineItems.length} item{cart.lineItems.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {!cart.lineItems || cart.lineItems.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">🛒</div>
          <p className="text-gray-500">Your cart is empty</p>
          <Link
            href="/list"
            className="mt-4 inline-block text-sm text-accent hover:underline"
          >
            Start Shopping →
          </Link>
        </div>
      ) : (
        <>
          {/* Cart Items */}
          <div data-cart-items className="flex flex-col gap-4">
            {cart.lineItems.map((item) => (
              <div
                data-cart-item
                className="flex min-h-[120px] gap-4 rounded-lg bg-gray-50 p-3 group"
                key={item._id}
              >
                {item.image && (
                  <Image
                    src={wixMedia.getScaledToFillImageUrl(
                      item.image,
                      72,
                      96,
                      {}
                    )}
                    alt=""
                    width={72}
                    height={96}
                    className="object-cover rounded-md"
                  />
                )}
                <div className="flex flex-col justify-between flex-1">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium text-sm line-clamp-2">
                        {item.productName?.original}
                      </h3>
                      <button
                        className="text-gray-400 hover:text-red-500 transition-colors inline-flex items-center justify-center min-h-[44px] min-w-[44px] -m-2 p-2"
                        onClick={() => removeItem(wixClient, item._id!)}
                        disabled={isLoading}
                        aria-label="Remove item"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Qty: {item.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-primary">
                    ₹{item.price?.amount}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Gift Wrap Upsell — paused. Restore by uncommenting the import above and the block below.
          <GiftWrapUpsell variant="compact" />
          */}

          {/* Subtotal & Actions */}
          <div className="border-t border-gray-100 pt-4">
            {/* Inflated Subtotal (display-only) */}
            <div className="flex justify-between text-gray-600 mb-2 text-sm">
              <span>Subtotal</span>
              <span>₹{displaySubtotal.toFixed(2)}</span>
            </div>

            {/* Shipping & Processing pricing */}
            <div className="space-y-2 mb-3 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Shipping</span>
                <span>
                  <span className="text-gray-400 line-through mr-2">₹99</span>
                  <span className="text-green-600 font-bold">FREE Shipping!</span>
                </span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Processing Fee</span>
                <span>
                  <span className="text-gray-400 line-through mr-2">₹50</span>
                  <span className="text-green-600 font-bold">FREE</span>
                </span>
              </div>
            </div>

            {/* Savings Line */}
            {cart.lineItems && cart.lineItems.length > 0 && (
              <div className="mb-3 flex items-center gap-1.5 bg-green-50/50 p-2 rounded-md border border-green-100">
                <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-green-600 text-sm font-medium">
                  You are saving ₹149 on this order!
                </p>
              </div>
            )}

            {/* Coupon */}
            <div className="mb-3">
              {couponApplied && appliedCouponCode ? (
                <div className="flex items-start justify-between gap-2 rounded-md border border-green-200 bg-green-50/60 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 text-green-700 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-green-800 truncate">
                        {appliedCouponCode} applied
                      </p>
                      {wixCouponDiscount > 0 && (
                        <p className="text-[11px] text-green-700/80">
                          You save ₹{wixCouponDiscount.toFixed(0)}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    disabled={removingCoupon}
                    className="text-[11px] font-semibold uppercase tracking-wider text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    {removingCoupon ? "..." : "Remove"}
                  </button>
                </div>
              ) : !showCouponInput ? (
                <button
                  type="button"
                  onClick={() => setShowCouponInput(true)}
                  className="w-full flex items-center justify-between rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:border-[#9B1B30] hover:text-[#9B1B30] transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Have a coupon code?
                  </span>
                  <span aria-hidden>+</span>
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
                          handleApplyCoupon();
                        }
                      }}
                      placeholder="Enter code"
                      autoFocus
                      className="flex-1 min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs tracking-wider uppercase outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={applyingCoupon || !couponCode.trim()}
                      className="rounded-md bg-[#9B1B30] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-[#7d1527] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {applyingCoupon ? "..." : "Apply"}
                    </button>
                  </div>
                  {couponError ? (
                    <p className="mt-1.5 text-[11px] text-red-600">{couponError}</p>
                  ) : (
                    <div className="mt-1.5 space-y-1">
                      <p className={`text-[11px] ${amountToUnlockShine > 0 ? "text-gray-500" : "text-green-600 font-medium"}`}>
                        {amountToUnlockShine > 0 ? (
                          <>Add ₹{amountToUnlockShine.toFixed(0)} more to use <span className="font-semibold tracking-wider">{SHINE_50_CODE}</span> (₹{SHINE_50_DISCOUNT} off).</>
                        ) : (
                          <>✅ Eligible! Use <span className="font-semibold tracking-wider">{SHINE_50_CODE}</span> for ₹{SHINE_50_DISCOUNT} off.</>
                        )}
                      </p>
                      <p className={`text-[11px] ${amountToUnlockCoupon > 0 ? "text-gray-500" : "text-green-600 font-medium"}`}>
                        {amountToUnlockCoupon > 0 ? (
                          <>Add ₹{amountToUnlockCoupon.toFixed(0)} more to use <span className="font-semibold tracking-wider">{CLUB_VIORA_CODE}</span> (10% off).</>
                        ) : (
                          <>✅ Eligible! Use <span className="font-semibold tracking-wider">{CLUB_VIORA_CODE}</span> for 10% off.</>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {couponApplied && wixCouponDiscount > 0 && (
              <div className="mb-2 flex justify-between text-sm font-medium text-green-700">
                <span>Coupon ({appliedCouponCode})</span>
                <span>-₹{wixCouponDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between mb-2 border-t border-gray-100 pt-2">
              <span className="font-medium">Estimated Total</span>
              <span className="font-bold text-lg">₹{estimatedTotal.toFixed(2)}</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Shipping and taxes calculated at checkout.
            </p>
            <p className="italic text-sm text-red-600 mb-4 px-1">
              Note - (Every Viora piece is carefully inspected before it reaches you. If anything arrives damaged or incorrect, please reach out within 48 hours of delivery and we&apos;ll make it right)
            </p>
            <div className="flex gap-3">
              <Link
                href="/cart"
                className="flex-1 py-2.5 text-center text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                View Cart
              </Link>
              <button
                className="flex-1 py-2.5 text-sm font-bold bg-[#9B1B30] text-white rounded-lg hover:bg-[#7d1527] transition-colors disabled:opacity-50 tracking-wide"
                disabled={isLoading}
                onClick={handleCheckout}
              >
                {isLoading ? "Loading..." : "ORDER NOW ⚡"}
              </button>
            </div>

            {/* Payment Method Icons */}
            <div className="mt-3 flex items-center justify-center gap-3 text-[10px] text-gray-400 font-medium">
              <span className="border border-gray-200 rounded px-1.5 py-0.5">UPI</span>
              <span className="border border-gray-200 rounded px-1.5 py-0.5">Visa</span>
              <span className="border border-gray-200 rounded px-1.5 py-0.5">Mastercard</span>
              <span className="border border-gray-200 rounded px-1.5 py-0.5">RuPay</span>
            </div>

            {/* Cart Trust Row */}
            <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-gray-500">
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <path d="M7 11V8a5 5 0 0110 0v3" />
                </svg>
                Secure
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 109 9" />
                  <path d="M3 4v5h5" />
                </svg>
                Easy Exchange
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="6" width="18" height="12" rx="2" />
                  <circle cx="12" cy="12" r="2.5" />
                  <path d="M6 12h.01M18 12h.01" />
                </svg>
                COD
              </span>
            </div>
          </div>
        </>
      )}

      <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
    </div>
  );
};

export default CartModal;
