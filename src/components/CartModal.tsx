"use client";

import Image from "next/image";
import { useCartStore } from "@/hooks/useCartStore";
import { media as wixMedia } from "@wix/sdk";
import { useWixClient } from "@/hooks/useWixClient";
import { trackMetaEvent } from "@/lib/metaEvents";
import Link from "next/link";
// import GiftWrapUpsell from "./GiftWrapUpsell"; // Gift wrap upsell paused — see banner comment below.
import { useState } from "react";
import nextDynamic from "next/dynamic";

// Defer the heavy CheckoutModal — only loaded when ORDER NOW is clicked.
const CheckoutModal = nextDynamic(() => import("./CheckoutModal"), { ssr: false });

const CartModal = () => {
  const wixClient = useWixClient();
  const { cart, isLoading, removeItem } = useCartStore();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

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

  return (
    <div className="absolute top-12 right-0 z-20 flex w-[min(400px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-col gap-6 rounded-xl border border-gray-100 bg-white p-4 shadow-xl">
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
          <div className="flex flex-col gap-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
            {cart.lineItems.map((item) => (
              <div
                className="flex gap-4 p-3 bg-gray-50 rounded-lg group"
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
            <div className="space-y-1.5 mb-3 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Shipping</span>
                <span>
                  <span className="text-gray-400 line-through mr-2">₹99</span>
                  <span className="text-green-700 font-bold">FREE Shipping!</span>
                </span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Processing Fee</span>
                <span>
                  <span className="text-gray-400 line-through mr-2">₹50</span>
                  <span className="text-green-700 font-bold">FREE</span>
                </span>
              </div>
            </div>

            {/* Savings Line */}
            {cart.lineItems && cart.lineItems.length > 0 && (
              <p className="text-green-600 text-sm font-medium mb-2">
                ✅ You are saving ₹{totalSavings.toFixed(0)} on this order!
              </p>
            )}

            <div className="flex items-center justify-between mb-2 border-t border-gray-100 pt-2">
              <span className="font-medium">Estimated Total</span>
              <span className="font-bold text-lg">₹{subtotal.toFixed(2)}</span>
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
