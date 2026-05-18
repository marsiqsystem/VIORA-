"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";
import { currentCart } from "@wix/ecom";
import { useToast } from "@/components/Toast";
import {
  trackAddPaymentInfo,
  trackInitiateCheckout,
  trackPurchase,
} from "@/lib/metaPixel";

type PaymentMethod = "PREPAID" | "COD";

interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
}

const PREPAID_DISCOUNT = 50;

const loadRazorpayScript = (): Promise<boolean> =>
  new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

const CheckoutModal = ({ open, onClose }: CheckoutModalProps) => {
  const router = useRouter();
  const wixClient = useWixClient();
  const { cart, getCart, clearCart } = useCartStore();
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setError("");
      setProcessing(false);
      // Auto-skip to Step 2 if user is logged in
      if (wixClient.auth.loggedIn()) {
        setStep(2);
      } else {
        setStep(1);
      }
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const lineItems = useMemo(() => cart.lineItems || [], [cart.lineItems]);

  const subtotal = useMemo(
    () =>
      lineItems.reduce(
        (sum, item) =>
          sum + (Number(item.price?.amount) || 0) * (item.quantity || 1),
        0
      ),
    [lineItems]
  );

  const isPrepaid = paymentMethod !== "COD";
  // Prepaid discount disabled while Razorpay is paused. Total = subtotal.
  // const total = Math.max(0, subtotal - (isPrepaid ? PREPAID_DISCOUNT : 0));
  const total = subtotal;

  // Display-only inflated subtotal. Frontend optics only. `total`/`subtotal`
  // (the real cart items total) is what's sent to /api/razorpay and used for
  // tracking / order amounts.
  const displaySubtotal = subtotal + 99 + 50;

  if (!mounted || !open) return null;

  const goToStep2 = () => {
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    setStep(2);
  };

  const validateDelivery = () => {
    if (!fullName.trim()) return "Please enter your full name.";
    if (!address.trim()) return "Please enter your address.";
    if (!/^\d{6}$/.test(pincode.trim())) return "Enter a valid 6-digit pincode.";
    if (!city.trim()) return "Please enter your city.";
    if (!state.trim()) return "Please enter your state.";
    if (!/^\d{10}$/.test(mobile.trim())) return "Enter a valid 10-digit mobile number.";
    return "";
  };

  const handlePayment = async () => {
    if (paymentMethod === "PREPAID") {
      setError("Prepaid checkout is coming soon. Please choose Cash on Delivery for now.");
      return;
    }

    const validationError = validateDelivery();
    if (validationError) {
      setError(validationError);
      return;
    }

    // Guard against an empty cart. Wix's createCheckoutFromCurrentCart will
    // otherwise reject with an opaque error.
    if (!lineItems.length) {
      const msg = "Your cart is empty.";
      setError(msg);
      showToast(msg, "error");
      return;
    }

    setError("");
    setProcessing(true);

    const contentIds = lineItems
      .map((item) => item.catalogReference?.catalogItemId)
      .filter((id): id is string => !!id);

    // Total quantity across line items (not unique-item count) is what Meta
    // Pixel's num_items expects.
    const totalQuantity = lineItems.reduce(
      (sum, item) => sum + (item.quantity || 1),
      0
    );

    trackInitiateCheckout(total, "INR", totalQuantity);

    try {
      // 1. Convert the current Wix cart to a checkout.
      let checkoutId: string;
      try {
        const checkoutResult = await wixClient.currentCart.createCheckoutFromCurrentCart({
          channelType: currentCart.ChannelType.WEB,
        });
        checkoutId = checkoutResult.checkoutId!;
        if (!checkoutId) throw new Error("Wix returned an empty checkoutId.");
        console.log("[COD] Step 1 OK - Checkout created:", checkoutId);
      } catch (stepErr: any) {
        console.error("[COD] Step 1 Failed (createCheckoutFromCurrentCart):", stepErr);
        throw new Error(`Checkout creation failed: ${stepErr?.details?.applicationError?.description || stepErr?.message || "Unknown"}`);
      }

      // 2. Finalize the Wix checkout/order on the server with API-key
      // permissions so the order lands in Wix Orders, Payments, and analytics
      // the same way a Wix checkout-created order does.
      let wixOrderId: string;
      try {
        const finalizeResponse = await fetch("/api/wix/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkoutId,
            details: {
              email: email.trim(),
              fullName: fullName.trim(),
              phone: mobile.trim(),
              addressLine1: address.trim(),
              city: city.trim(),
              state: state.trim(),
              postalCode: pincode.trim(),
              paymentMethod,
            },
          }),
        });

        const finalizeResult = await finalizeResponse.json();

        if (!finalizeResponse.ok) {
          throw new Error(finalizeResult?.error || "Wix order creation failed.");
        }

        wixOrderId = finalizeResult.orderId;
        if (!wixOrderId) throw new Error("Wix did not return an order ID.");
        console.log("[COD] Step 2 OK - Wix checkout finalized:", finalizeResult);
      } catch (stepErr: any) {
        console.error("[COD] Step 2 Failed (finalize Wix checkout):", stepErr);
        throw new Error(`Wix order finalization failed: ${stepErr?.message || "Unknown"}`);
      }

      // NOTE: For COD / manual payments, NO explicit payment processing call is
      // needed from the frontend. The Wix backend automatically handles the
      // order's payment status based on the "Manual Payments" configuration in
      // your Wix Dashboard (Settings > Accept Payments > Manual Payments).
      // The order will appear in the dashboard as "Pending Payment" - which is
      // the correct COD workflow. Mark it as paid manually in the dashboard
      // once you collect the cash.
      console.log("[COD] Step 3.5 - Skipping frontend payment processing (handled by Wix backend for manual payments).");

      // 4. Clear the user's Wix cart AND the local Zustand store.
      //    deleteCurrentCart() removes the cart on Wix's side. getCart() right
      //    after it used to throw OWNED_CART_NOT_FOUND silently, leaving the
      //    purchased items lingering in the local store. That is the "cart not"
      //    clearing" bug. Reset local state synchronously via clearCart() so
      //    the cart icon/CartModal reflect the empty state immediately, even
      //    if the network call hiccups.
      clearCart();
      try {
        await wixClient.currentCart.deleteCurrentCart();
      } catch (clearErr) {
        console.warn("Failed to delete Wix cart after COD order:", clearErr);
      }
      // Re-fetch in the background. If the backend confirms empty (or throws
      // OWNED_CART_NOT_FOUND, which getCart() now handles by resetting), local
      // state stays clean. If a fresh cart was somehow created mid-flow, this
      // pulls it down so the UI is honest.
      getCart(wixClient).catch(() => {});

      // 5. Tracking + redirect to success page.
      try {
        window.sessionStorage.setItem(
          "vioraPendingPurchase",
          JSON.stringify({
            value: total,
            currency: "INR",
            content_ids: contentIds,
          })
        );
      } catch {}
      trackPurchase(total, "INR", contentIds, wixOrderId);

      // Close the modal BEFORE navigating so the parent (CartModal / cart
      // page) doesn't keep painting it over the success page.
      onClose();
      router.push(`/success?orderId=${encodeURIComponent(wixOrderId)}`);
      return;
    } catch (err: any) {
      // Surface the full Wix API error so the developer can debug.
      console.error("Order placement failed:", err);
      const cause =
        err?.details?.applicationError?.description ||
        err?.message ||
        "Unknown error";
      setError(`Failed to place order: ${cause}`);
      showToast("Failed to place order, please try again", "error");
      setProcessing(false);
      // Do NOT redirect to /success on failure.
    }
  };

  const paymentOptions: Array<{
    id: PaymentMethod;
    label: string;
    sub?: string;
  }> = [
    { id: "COD", label: "Cash on Delivery (COD)", sub: "Pay when you receive your order" },
    { id: "PREPAID", label: "Prepaid (UPI / Cards)", sub: "Get ₹50 OFF on Prepaid Orders (Coming Soon)" },
  ];

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/55 md:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
    >
      <div
        className="relative w-full md:max-w-lg max-h-[95vh] overflow-y-auto rounded-t-2xl md:rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex-1 flex justify-center">
            <Image
              src="/logo%20compressed.png"
              alt="Viora Jewels"
              width={120}
              height={40}
              className="h-10 w-auto object-contain"
              style={{ width: "auto" }}
            />
          </div>
          <span className="text-[10px] md:text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-1 whitespace-nowrap">
            100% Secured
          </span>
        </div>

        {/* Offer banner hidden while prepaid is paused. Restore with prepaid relaunch.
        <div className="bg-green-600 text-white text-center text-sm font-semibold py-2 px-4">
          Get Extra ₹50 Off on Prepaid Payments
        </div>
        */}

        <div className="p-5 space-y-5">
          {/* Step 1 - Contact */}
          {step === 1 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">
                1. Contact
              </h3>
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Email Address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                />
                <span className="mt-1 block text-xs text-gray-500">
                  We&apos;ll send your order confirmation here.
                </span>
              </label>
              <button
                type="button"
                onClick={goToStep2}
                disabled={processing}
                className="w-full mt-2 rounded-lg bg-[#9B1B30] py-3 text-sm font-semibold uppercase tracking-wider text-white hover:bg-[#7d1527] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Continue
              </button>
            </section>
          )}

          {/* Step 2 - Delivery + Payment */}
          {step === 2 && (
            <>
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">
                  2. Delivery
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full Name"
                    className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                  />
                  <textarea
                    rows={3}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Full Address (house, street)"
                    className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20 resize-none"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                      className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                    />
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="State"
                      className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="Pincode"
                      inputMode="numeric"
                      className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                    />
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Phone (10 digits)"
                      inputMode="numeric"
                      className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                    />
                  </div>
                </div>
              </section>

              {/* Payment Selection */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">
                  3. Payment Method
                </h3>
                <div className="flex flex-col gap-2">
                  {paymentOptions.map((opt) => {
                    const selected = paymentMethod === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPaymentMethod(opt.id)}
                        className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all ${
                          selected
                            ? "border-[#9B1B30] bg-[#9B1B30]/5 ring-2 ring-[#9B1B30]/20"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                            selected ? "border-[#9B1B30] bg-[#9B1B30]" : "border-gray-300"
                          }`}
                        />
                        <span className="flex-1">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-primary">
                              {opt.label}
                            </span>
                          </span>
                          {opt.sub && (
                            <span className={`block text-xs mt-0.5 ${opt.id === "PREPAID" ? "text-green-600 font-medium" : "text-gray-500"}`}>
                              {opt.sub}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Total summary */}
              <section className="rounded-lg bg-gray-50 p-4 space-y-1 text-sm border border-gray-100 shadow-sm">
                <div className="flex justify-between text-gray-600 mb-2">
                  <span>Subtotal</span>
                  <span>₹{displaySubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span>
                    <span className="text-gray-400 line-through mr-2">₹99</span>
                    <span className="text-green-600 font-bold">FREE Shipping!</span>
                  </span>
                </div>
                <div className="flex justify-between text-gray-600 mb-2">
                  <span>Processing Fee</span>
                  <span>
                    <span className="text-gray-400 line-through mr-2">₹50</span>
                    <span className="text-green-600 font-bold">FREE</span>
                  </span>
                </div>

                <div className="mt-3 mb-2 flex items-center gap-1.5 bg-green-50/50 p-2 rounded-md border border-green-100">
                  <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-green-600 text-sm font-medium">
                    You are saving ₹149 on this order!
                  </p>
                </div>

                {/* Prepaid discount row hidden while prepaid is paused.
                {isPrepaid && (
                  <div className="flex justify-between text-green-700 font-medium">
                    <span>Prepaid Discount</span>
                    <span>- ₹{PREPAID_DISCOUNT}</span>
                  </div>
                )}
                */}
                <div className="flex justify-between text-base font-bold text-primary pt-3 border-t border-gray-200 mt-3">
                  <span>Estimated Total</span>
                  <span>₹{total.toFixed(2)}</span>
                </div>
              </section>

              <button
                type="button"
                onClick={handlePayment}
                disabled={processing}
                className="w-full rounded-lg bg-[#9B1B30] py-3.5 text-sm font-bold uppercase tracking-wider text-white hover:bg-[#7d1527] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processing
                  ? "Processing..."
                  : `PLACE ORDER - ₹${total.toFixed(2)}`}
              </button>

              <p className="text-[11px] text-gray-500 text-center">
                Payments are 100% secure and encrypted.
              </p>
            </>
          )}

          {/* Global Error Display */}
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 mt-2">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default CheckoutModal;
