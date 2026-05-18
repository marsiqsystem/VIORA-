"use client";

import Image from "next/image";
import Link from "next/link";
import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";
import { media as wixMedia } from "@wix/sdk";
import { trackMetaEvent } from "@/lib/metaEvents";
// import GiftWrapUpsell from "@/components/GiftWrapUpsell"; // Gift wrap upsell paused — see banner comment below.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import nextDynamic from "next/dynamic";

const CheckoutModal = nextDynamic(() => import("@/components/CheckoutModal"), {
    ssr: false,
});

const CartPage = () => {
    const wixClient = useWixClient();
    const router = useRouter();
    const { cart, isLoading, getCart, removeItem, updateQuantity } = useCartStore();
    const [checkoutOpen, setCheckoutOpen] = useState(false);

    useEffect(() => {
        getCart(wixClient).catch(() => {});
    }, [getCart, wixClient]);

    const handleCheckout = async () => {
        try {
            const lineItems = cart.lineItems || [];
            trackMetaEvent("InitiateCheckout", {
                currency: "INR",
                value: lineItems.reduce(
                    (sum, item) =>
                        sum +
                        (Number(item.price?.amount) || 0) * (item.quantity || 1),
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

    const handleQuantityChange = (itemId: string, newQuantity: number) => {
        if (newQuantity < 1) return;
        updateQuantity(wixClient, itemId, newQuantity);
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

    // Base savings: shipping ₹99 + processing fee ₹50 = ₹149. Prepaid bonus shown in checkout modal.
    const totalSavings = 149 + mrpSavings;

    // Display-only inflated subtotal — frontend optics only. `subtotal` (the real
    // cart items total) is what gets sent to the backend / payment gateway.
    const displaySubtotal = subtotal + 99 + 50;

    return (
        <div className="min-h-[calc(100vh-180px)] px-4 md:px-8 lg:px-16 xl:px-32 2xl:px-64 py-12">
            <h1 className="text-3xl font-semibold mb-8">Shopping Cart</h1>

            {!cart.lineItems || cart.lineItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-6">
                    <div className="text-gray-400 text-6xl">🛒</div>
                    <h2 className="text-xl text-gray-600">Your cart is empty</h2>
                    <p className="text-gray-500">Looks like you haven&apos;t added anything to your cart yet.</p>
                    <Link
                        href="/list"
                        className="mt-4 bg-accent text-white py-3 px-8 rounded-md hover:bg-opacity-90 transition-colors"
                    >
                        Continue Shopping
                    </Link>
                </div>
            ) : (
                <div className="flex flex-col lg:flex-row gap-12">
                    {/* Cart Items */}
                    <div className="flex-1">
                        <div className="hidden md:grid grid-cols-5 gap-4 pb-4 border-b text-sm font-medium text-gray-500">
                            <div className="col-span-2">Product</div>
                            <div className="text-center">Price</div>
                            <div className="text-center">Quantity</div>
                            <div className="text-right">Total</div>
                        </div>

                        <div className="flex flex-col divide-y">
                            {cart.lineItems.map((item) => (
                                <div
                                    key={item._id}
                                    className="py-6 grid grid-cols-1 md:grid-cols-5 gap-4 items-center"
                                >
                                    {/* Product */}
                                    <div className="col-span-1 md:col-span-2 flex gap-4">
                                        {item.image && (
                                            <div className="relative w-24 h-32 flex-shrink-0">
                                                <Image
                                                    src={wixMedia.getScaledToFillImageUrl(
                                                        item.image,
                                                        96,
                                                        128,
                                                        {}
                                                    )}
                                                    alt={item.productName?.original || "Product"}
                                                    fill
                                                    sizes="96px"
                                                    className="object-cover rounded-md"
                                                />
                                            </div>
                                        )}
                                        <div className="flex flex-col justify-center">
                                            <h3 className="font-medium">{item.productName?.original}</h3>
                                            <p className="text-sm text-gray-500 mt-1">
                                                {item.availability?.status}
                                            </p>
                                            <button
                                                onClick={() => removeItem(wixClient, item._id!)}
                                                disabled={isLoading}
                                                className="text-sm text-red-500 hover:text-red-700 mt-2 w-fit disabled:opacity-50"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>

                                    {/* Price */}
                                    <div className="text-center">
                                        <span className="md:hidden text-gray-500 mr-2">Price:</span>
                                        ₹{item.price?.amount}
                                    </div>

                                    {/* Quantity */}
                                    <div className="flex items-center justify-center gap-3">
                                        <span className="md:hidden text-gray-500 mr-2">Qty:</span>
                                        <button
                                            onClick={() =>
                                                handleQuantityChange(item._id!, (item.quantity || 1) - 1)
                                            }
                                            disabled={isLoading || (item.quantity || 1) <= 1}
                                            className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            -
                                        </button>
                                        <span className="w-8 text-center font-medium">
                                            {item.quantity}
                                        </span>
                                        <button
                                            onClick={() =>
                                                handleQuantityChange(item._id!, (item.quantity || 1) + 1)
                                            }
                                            disabled={isLoading}
                                            className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-50"
                                        >
                                            +
                                        </button>
                                    </div>

                                    {/* Total */}
                                    <div className="text-right font-medium">
                                        <span className="md:hidden text-gray-500 mr-2">Total:</span>
                                        ₹{(Number(item.price?.amount) * (item.quantity || 1)).toFixed(2)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Order Summary */}
                    <div className="lg:w-80">
                        <div className="bg-gray-50 rounded-lg p-6 sticky top-24">
                            <h2 className="text-xl font-semibold mb-6">Order Summary</h2>

                            <div className="space-y-3 mb-5">
                                <div className="flex justify-between text-gray-600 text-sm">
                                    <span>Subtotal ({cart.lineItems.length} items)</span>
                                    <span>₹{displaySubtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-gray-600 text-sm">
                                    <span>Shipping</span>
                                    <span>
                                        <span className="text-gray-400 line-through mr-2">₹99</span>
                                        <span className="text-green-600 font-bold">FREE Shipping!</span>
                                    </span>
                                </div>
                                <div className="flex justify-between text-gray-600 text-sm">
                                    <span>Processing Fee</span>
                                    <span>
                                        <span className="text-gray-400 line-through mr-2">₹50</span>
                                        <span className="text-green-600 font-bold">FREE</span>
                                    </span>
                                </div>
                            </div>

                            {/* Savings Line */}
                            <div className="mb-5 flex items-start gap-2 bg-green-50/50 p-3 rounded-lg border border-green-100">
                                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                <div>
                                    <p className="text-green-600 text-sm font-medium">
                                        You are saving ₹149 on this order!
                                    </p>
                                    <span className="block text-xs font-normal text-green-700/80 mt-1">
                                        Choose a prepaid method at checkout for ₹50 extra off.
                                    </span>
                                </div>
                            </div>

                            <div className="border-t pt-4 mb-6">
                                <div className="flex justify-between text-lg font-semibold">
                                    <span>Estimated Total</span>
                                    <span>₹{subtotal.toFixed(2)}</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Taxes calculated at checkout
                                </p>
                            </div>

                            <p className="italic text-sm text-red-600 mb-4 leading-relaxed">
                                Note - (Every Viora piece is carefully inspected before it reaches you. If anything arrives damaged or incorrect, please reach out within 48 hours of delivery and we&apos;ll make it right)
                            </p>

                            {/* Gift Wrap Upsell — paused. Restore by uncommenting the import above and the block below.
                            <div className="mb-4">
                                <GiftWrapUpsell />
                            </div>
                            */}

                            <button
                                onClick={handleCheckout}
                                disabled={isLoading}
                                className="w-full bg-[#9B1B30] text-white py-3.5 rounded-md hover:bg-[#7d1527] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-bold tracking-wide text-sm"
                            >
                                {isLoading ? "Processing..." : "ORDER NOW ⚡"}
                            </button>

                            {/* Payment Method Icons */}
                            <div className="mt-3 flex items-center justify-center gap-3 text-[10px] text-gray-400 font-medium">
                                <span className="border border-gray-200 rounded px-1.5 py-0.5">UPI</span>
                                <span className="border border-gray-200 rounded px-1.5 py-0.5">Visa</span>
                                <span className="border border-gray-200 rounded px-1.5 py-0.5">Mastercard</span>
                                <span className="border border-gray-200 rounded px-1.5 py-0.5">RuPay</span>
                            </div>

                            {/* Trust Row */}
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

                            <Link
                                href="/list"
                                className="block text-center mt-4 text-gray-600 hover:text-black transition-colors"
                            >
                                Continue Shopping
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
        </div>
    );
};

export default CartPage;
