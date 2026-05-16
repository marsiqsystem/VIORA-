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

type PaymentMethod = "UPI" | "CARD" | "WALLET" | "COD";

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
  const { cart, getCart } = useCartStore();
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [mobile, setMobile] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  // Razorpay/prepaid temporarily disabled pending domain approval. Default locked to COD.
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
      // Reset stale processing flag from a previous interrupted attempt so
      // the "PLACE ORDER" button never gets stuck on "Processing...".
      setProcessing(false);
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

  // Display-only inflated subtotal — frontend optics only. `total`/`subtotal`
  // (the real cart items total) is what's sent to /api/razorpay and used for
  // tracking / order amounts.
  const displaySubtotal = subtotal + 99 + 50;

  if (!mounted || !open) return null;

  const goToStep2 = () => {
    if (!/^\d{10}$/.test(mobile.trim())) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setError("");
    setStep(2);
  };

  const validateDelivery = () => {
    if (!fullName.trim()) return "Please enter your full name.";
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email))
      return "Please enter a valid email.";
    if (!address.trim()) return "Please enter your address.";
    if (!/^\d{6}$/.test(pincode.trim())) return "Enter a valid 6-digit pincode.";
    return "";
  };

  const handlePayment = async () => {
    const validationError = validateDelivery();
    if (validationError) {
      setError(validationError);
      return;
    }

    // Guard against an empty cart — Wix's createCheckoutFromCurrentCart will
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
      // COD-only flow while Razorpay/online payments are paused pending domain
      // approval. We officially create the order in Wix so it appears in the
      // Wix admin dashboard with Pending payment status (Cash on Delivery).
      const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] || fullName.trim();
      const lastName = nameParts.slice(1).join(" ") || undefined;

      const shippingAndBilling = {
        address: {
          country: "IN",
          addressLine1: address.trim(),
          postalCode: pincode.trim(),
        },
        contactDetails: {
          firstName,
          lastName,
          phone: mobile.trim(),
        },
      };

      // 1. Convert the current Wix cart to a checkout.
      const checkout = await wixClient.currentCart.createCheckoutFromCurrentCart({
        channelType: currentCart.ChannelType.WEB,
      });

      const checkoutId = checkout.checkoutId;
      if (!checkoutId) {
        throw new Error("Could not create Wix checkout from cart.");
      }

      // 2. Attach buyer / billing / shipping details and a COD marker.
      const wixClientAny = wixClient as any;
      if (wixClientAny.checkout?.updateCheckout) {
        await wixClientAny.checkout.updateCheckout(checkoutId, {
          _id: checkoutId,
          billingInfo: shippingAndBilling,
          shippingInfo: { shippingDestination: shippingAndBilling },
          buyerInfo: { email: email.trim() },
          buyerNote: `Payment: Cash on Delivery (COD). Recipient phone: ${mobile.trim()}. Pincode: ${pincode.trim()}.`,
          customFields: [
            { title: "Payment Method", value: "Cash on Delivery" },
            { title: "Payment Status", value: "Pending" },
            { title: "Mobile", value: mobile.trim() },
            { title: "Pincode", value: pincode.trim() },
          ],
        });
      }

      // 3. Create the actual Wix order from the checkout.
      let wixOrderId: string | undefined;
      if (wixClientAny.checkout?.createOrder) {
        const orderResult = await wixClientAny.checkout.createOrder(checkoutId);
        wixOrderId =
          orderResult?.orderId ||
          orderResult?.order?._id ||
          orderResult?._id ||
          orderResult?.id;
      }

      if (!wixOrderId) {
        throw new Error("Wix did not return an order id.");
      }

      // 4. Clear the user's Wix cart and refresh local store.
      try {
        if (wixClientAny.currentCart?.deleteCurrentCart) {
          await wixClientAny.currentCart.deleteCurrentCart();
        }
        await getCart(wixClient);
      } catch (clearErr) {
        // Cart clear is non-fatal — order is already created.
        console.warn("Failed to clear cart after COD order:", clearErr);
      }

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

      /* ---------------------------------------------------------------
       * RAZORPAY / ONLINE PAYMENT HANDOFF — TEMPORARILY DISABLED
       * Uncomment this block once the production domain is approved by
       * Razorpay. Also re-enable the prepaid radio options, the offer
       * banner, the prepaid discount calculation, and the "Pay Now" CTA.
       * ---------------------------------------------------------------
      if (paymentMethod === "COD") {
        const codOrderId = `viora_cod_${Date.now()}`;
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
        trackPurchase(total, "INR", contentIds, codOrderId);
        router.push(`/success?orderId=${codOrderId}`);
        return;
      }

      const res = await fetch("/api/razorpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: total,
          currency: "INR",
          receipt: `viora_${Date.now()}`,
          notes: {
            mobile,
            email,
            fullName,
            pincode,
            method: paymentMethod,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Could not create payment order.");
      }

      const { order_id, amount, currency, key_id } = await res.json();

      const scriptOk = await loadRazorpayScript();
      if (!scriptOk || !window.Razorpay) {
        throw new Error("Could not load Razorpay. Please try again.");
      }

      trackAddPaymentInfo(total, "INR");

      const options: Record<string, any> = {
        key: key_id,
        amount,
        currency,
        order_id,
        name: "Viora Jewels",
        description: "Order Payment",
        prefill: {
          name: fullName,
          email,
          contact: mobile,
        },
        notes: { address, pincode },
        theme: { color: "#9B1B30" },
        handler: function (response: any) {
          const paidOrderId =
            response?.razorpay_order_id || order_id || `viora_${Date.now()}`;
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
          router.push(`/success?orderId=${paidOrderId}`);
        },
        modal: {
          ondismiss: () => {
            setProcessing(false);
          },
        },
      };

      if (paymentMethod === "UPI") {
        options.method = { upi: true };
        options.config = {
          display: { preferences: { show_default_blocks: true } },
        };
      } else if (paymentMethod === "CARD") {
        options.method = { card: true };
      } else if (paymentMethod === "WALLET") {
        options.method = { wallet: true };
      }

      const rzp = new window.Razorpay(options);
      rzp.on?.("payment.failed", () => {
        setError("Payment failed. Please try again.");
        setProcessing(false);
      });
      rzp.open();
      */
    } catch (err: any) {
      // Surface the full error so it's debuggable in the browser console while
      // still showing a clean user-facing message in the toast.
      console.error("Order placement failed:", err);
      const cause =
        err?.details?.applicationError?.description ||
        err?.message ||
        "Unknown error";
      const userMsg = "Failed to place order, please try again";
      setError(`${userMsg} (${cause})`);
      showToast(userMsg, "error");
      setProcessing(false);
      // Do NOT redirect to /success on failure.
    }
  };

  const paymentOptions: Array<{
    id: PaymentMethod;
    label: string;
    sub?: string;
    discount?: boolean;
    recommended?: boolean;
  }> = [
    // Prepaid options paused pending Razorpay domain approval. Restore when re-enabling.
    // { id: "UPI", label: "UPI", sub: "PhonePe, GPay, Paytm & more", discount: true, recommended: true },
    // { id: "CARD", label: "Debit / Credit Cards", sub: "Visa, Mastercard, RuPay", discount: true },
    // { id: "WALLET", label: "Wallets", sub: "Paytm, Mobikwik, Freecharge", discount: true },
    { id: "COD", label: "Cash on Delivery", sub: "Pay when you receive your order" },
  ];

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-end md:items-center justify-center bg-black/55 backdrop-blur-sm"
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
              src="/final%20logo%20copy.png"
              alt="Viora Jewels"
              width={120}
              height={40}
              className="h-10 w-auto object-contain"
            />
          </div>
          <span className="text-[10px] md:text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-1 whitespace-nowrap">
            🔒 100% Secured
          </span>
        </div>

        {/* Offer banner — hidden while prepaid is paused. Restore with prepaid relaunch.
        <div className="bg-green-600 text-white text-center text-sm font-semibold py-2 px-4">
          🎉 Get Extra ₹50 Off on Prepaid Payments
        </div>
        */}

        <div className="p-5 space-y-5">
          {/* Step 1 - Contact */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">
              1. Contact
            </h3>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Mobile Number</span>
              <input
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit mobile"
                inputMode="numeric"
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
              />
              <span className="mt-1 block text-xs text-gray-500">
                Get OTP for faster checkout
              </span>
            </label>
            {step === 1 && (
              <button
                type="button"
                onClick={goToStep2}
                className="w-full mt-2 rounded-lg bg-[#9B1B30] py-3 text-sm font-semibold uppercase tracking-wider text-white hover:bg-[#7d1527]"
              >
                Continue
              </button>
            )}
          </section>

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
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                  />
                  <textarea
                    rows={3}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Full Address (house, street, city, state)"
                    className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20 resize-none"
                  />
                  <input
                    type="text"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Pincode"
                    inputMode="numeric"
                    className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                  />
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
                            {opt.recommended && (
                              <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">
                                Recommended
                              </span>
                            )}
                            {opt.discount && (
                              <span className="text-[10px] uppercase tracking-wide bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">
                                ₹50 Discount
                              </span>
                            )}
                          </span>
                          {opt.sub && (
                            <span className="block text-xs text-gray-500 mt-0.5">
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
              <section className="rounded-lg bg-gray-50 p-4 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>₹{displaySubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span>
                    <span className="text-gray-400 line-through mr-2">₹99</span>
                    <span className="text-green-700 font-bold">FREE</span>
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Processing Fee</span>
                  <span>
                    <span className="text-gray-400 line-through mr-2">₹50</span>
                    <span className="text-green-700 font-bold">FREE</span>
                  </span>
                </div>
                {/* Prepaid discount row — hidden while prepaid is paused.
                {isPrepaid && (
                  <div className="flex justify-between text-green-700 font-medium">
                    <span>Prepaid Discount</span>
                    <span>− ₹{PREPAID_DISCOUNT}</span>
                  </div>
                )}
                */}
                <div className="flex justify-between text-base font-bold text-primary pt-2 border-t border-gray-200 mt-2">
                  <span>Total Payable</span>
                  <span>₹{total.toFixed(2)}</span>
                </div>
              </section>

              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={handlePayment}
                disabled={processing}
                className="w-full rounded-lg bg-[#9B1B30] py-3.5 text-sm font-bold uppercase tracking-wider text-white hover:bg-[#7d1527] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processing
                  ? "Processing..."
                  : `PLACE ORDER (COD) ⚡ — ₹${total.toFixed(2)}`}
              </button>

              <p className="text-[11px] text-gray-500 text-center">
                🔒 Payments are 100% secure and encrypted.
              </p>
            </>
          )}

          {step === 1 && error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
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
