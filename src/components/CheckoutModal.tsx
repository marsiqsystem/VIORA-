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
} from "@/lib/metaPixel";
import { trackMetaEvent, setMetaUserData } from "@/lib/metaEvents";

type PaymentMethod = "PREPAID" | "COD";

interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
}

const PREPAID_DISCOUNT = 50;
const CLUB_VIORA_CODE = "CLUBVIORA";
const CLUB_VIORA_MINIMUM = 999;
const SHINE_50_CODE = "SHINE50";
const SHINE_50_MINIMUM = 700;
const SHINE_50_DISCOUNT = 50;

const INDIAN_SUBDIVISIONS: { code: string; name: string }[] = [
  { code: "IN-AN", name: "Andaman and Nicobar Islands" },
  { code: "IN-AP", name: "Andhra Pradesh" },
  { code: "IN-AR", name: "Arunachal Pradesh" },
  { code: "IN-AS", name: "Assam" },
  { code: "IN-BR", name: "Bihar" },
  { code: "IN-CH", name: "Chandigarh" },
  { code: "IN-CT", name: "Chhattisgarh" },
  { code: "IN-DH", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "IN-DL", name: "Delhi" },
  { code: "IN-GA", name: "Goa" },
  { code: "IN-GJ", name: "Gujarat" },
  { code: "IN-HR", name: "Haryana" },
  { code: "IN-HP", name: "Himachal Pradesh" },
  { code: "IN-JK", name: "Jammu and Kashmir" },
  { code: "IN-JH", name: "Jharkhand" },
  { code: "IN-KA", name: "Karnataka" },
  { code: "IN-KL", name: "Kerala" },
  { code: "IN-LA", name: "Ladakh" },
  { code: "IN-LD", name: "Lakshadweep" },
  { code: "IN-MP", name: "Madhya Pradesh" },
  { code: "IN-MH", name: "Maharashtra" },
  { code: "IN-MN", name: "Manipur" },
  { code: "IN-ML", name: "Meghalaya" },
  { code: "IN-MZ", name: "Mizoram" },
  { code: "IN-NL", name: "Nagaland" },
  { code: "IN-OR", name: "Odisha" },
  { code: "IN-PY", name: "Puducherry" },
  { code: "IN-PB", name: "Punjab" },
  { code: "IN-RJ", name: "Rajasthan" },
  { code: "IN-SK", name: "Sikkim" },
  { code: "IN-TN", name: "Tamil Nadu" },
  { code: "IN-TG", name: "Telangana" },
  { code: "IN-TR", name: "Tripura" },
  { code: "IN-UP", name: "Uttar Pradesh" },
  { code: "IN-UT", name: "Uttarakhand" },
  { code: "IN-WB", name: "West Bengal" },
];

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
  const {
    cart,
    getCart,
    clearCart,
    couponApplied,
    couponError,
    applyCoupon,
    removeCoupon,
  } = useCartStore();
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [pincode, setPincode] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [showCouponInput, setShowCouponInput] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [removingCoupon, setRemovingCoupon] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setError("");
      setProcessing(false);
      // Auto-skip to Step 2 if user is logged in. Also pull their member email
      // so the order isn't rejected with "Missing checkout contact" — Step 1
      // (where email is normally captured) is skipped in this branch.
      if (wixClient.auth.loggedIn()) {
        setStep(2);
        (async () => {
          try {
            const memberRes: any = await (wixClient as any).members?.getCurrentMember?.({
              fieldsets: ["FULL"],
            });
            const memberEmail =
              memberRes?.member?.loginEmail ||
              memberRes?.member?.contact?.emails?.[0] ||
              "";
            if (memberEmail) {
              setEmail((prev) => prev || memberEmail);
            }
          } catch (e) {
            console.warn("Could not load current member email:", e);
          }
        })();
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
  
  const wixCouponDiscount = useMemo(() => {
    const appliedDiscounts = (cart as any)?.appliedDiscounts || [];
    return appliedDiscounts.reduce((sum: number, d: any) => {
      if (!d.coupon) return sum;
      // Trust Wix's reported discount amount when present; otherwise fall back
      // to the known coupon rules so the Razorpay charge stays in sync with the
      // Wix order total.
      const reported = Number(d.coupon?.amount?.amount ?? d.discountAmount?.amount ?? 0);
      if (reported > 0) return sum + reported;
      const code = d.coupon.code?.toUpperCase();
      if (code === "CLUBVIORA" && subtotal >= 999) return sum + subtotal * 0.1;
      if (code === "SHINE50" && subtotal >= 700) return sum + 50;
      return sum;
    }, 0);
  }, [cart, subtotal]);

  // Flat ₹50 off when the customer pays online (prepaid via Razorpay).
  const prepaidDiscount = isPrepaid ? PREPAID_DISCOUNT : 0;
  const total = Math.max(0, subtotal - wixCouponDiscount - prepaidDiscount);

  const appliedCouponCode = useMemo(() => {
    const appliedDiscounts = (cart as any)?.appliedDiscounts || [];
    return appliedDiscounts.find((d: any) => d.coupon)?.coupon?.code || "";
  }, [cart]);
  const amountToUnlockClub = Math.max(0, CLUB_VIORA_MINIMUM - subtotal);
  const amountToUnlockShine = Math.max(0, SHINE_50_MINIMUM - subtotal);

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
    setMetaUserData({ email: email.trim() });
    setStep(2);
  };

  const validateDelivery = () => {
    if (!fullName.trim()) return "Please enter your full name.";
    if (!address.trim()) return "Please enter your address.";
    if (!pincode.trim()) return "Please enter your pincode.";
    if (!city.trim()) return "Please enter your city.";
    if (!state.trim()) return "Please select your state.";
    const digitsOnly = mobile.replace(/\D/g, "");
    if (digitsOnly.length !== 10) {
      return "Phone number must be exactly 10 digits. Please remove any country code (like +91 or 0) and try again.";
    }
    return "";
  };

  // Convert the current Wix cart into a finalized, approved Wix order via the
  // server route (API-key permissions). Used by both COD and prepaid flows so
  // the order lands in Wix Orders/Payments/analytics identically. For prepaid,
  // `razorpayPaymentId` is recorded on the order for reconciliation.
  const finalizeWixOrder = async (
    method: PaymentMethod,
    razorpayPaymentId?: string
  ): Promise<string> => {
    const checkoutResult = await wixClient.currentCart.createCheckoutFromCurrentCart({
      channelType: currentCart.ChannelType.WEB,
    });
    const checkoutId = checkoutResult.checkoutId;
    if (!checkoutId) throw new Error("Wix returned an empty checkoutId.");

    const finalizeResponse = await fetch("/api/wix/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkoutId,
        details: {
          email: email.trim(),
          fullName: fullName.trim(),
          phone: mobile.replace(/\D/g, ""),
          addressLine1: address.trim(),
          addressLine2: addressLine2.trim(),
          city: city.trim(),
          state: state.trim(),
          postalCode: pincode.trim(),
          paymentMethod: method,
          razorpayPaymentId,
          // Actual amount charged via Razorpay (includes the prepaid ₹50 off),
          // recorded on the Wix order for reconciliation.
          razorpayAmount: method === "PREPAID" ? total.toFixed(2) : undefined,
        },
      }),
    });

    const finalizeResult = await finalizeResponse.json();
    if (!finalizeResponse.ok) {
      throw new Error(finalizeResult?.error || "Wix order creation failed.");
    }
    const wixOrderId = finalizeResult.orderId;
    if (!wixOrderId) throw new Error("Wix did not return an order ID.");
    return wixOrderId;
  };

  // Clear the cart (Wix + local store), fire purchase tracking, and route to
  // the success page. Shared by both payment flows.
  const completeOrder = async (wixOrderId: string, contentIds: string[]) => {
    // Reset local state synchronously so the cart icon/CartModal reflect the
    // empty state immediately, even if the network call hiccups.
    clearCart();
    wixClient.currentCart
      .deleteCurrentCart()
      .catch((clearErr) =>
        console.warn("Failed to delete Wix cart after order:", clearErr)
      );
    // Re-fetch in the background to keep local state honest.
    getCart(wixClient).catch(() => {});

    try {
      window.sessionStorage.setItem(
        "vioraPendingPurchase",
        JSON.stringify({ value: total, currency: "INR", content_ids: contentIds })
      );
    } catch {}
    await trackMetaEvent("Purchase", {
      value: total,
      currency: "INR",
      content_ids: contentIds,
      content_type: "product",
      transaction_id: wixOrderId,
    });
    try {
      window.sessionStorage.setItem(`viora_purchase_fired_${wixOrderId}`, "1");
      window.sessionStorage.removeItem("vioraPendingPurchase");
    } catch {}

    // Close the modal BEFORE navigating so the parent (CartModal / cart page)
    // doesn't keep painting it over the success page.
    onClose();
    router.push(`/success?orderId=${encodeURIComponent(wixOrderId)}`);
  };

  // Prepaid flow: create a Razorpay order, open the checkout modal, verify the
  // signature server-side on success, then finalize the Wix order. The Wix
  // order is created ONLY after payment is verified, so unpaid carts never
  // become orders. Note: rzp.open() returns immediately — completion happens in
  // the handler/dismiss/failure callbacks, which own setProcessing(false).
  const runPrepaidOrder = async (contentIds: string[]) => {
    // 1. Create the Razorpay order on the server (KEY_SECRET stays server-side).
    const orderResponse = await fetch("/api/razorpay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: total,
        currency: "INR",
        receipt: `viora_${Date.now()}`,
        notes: { email: email.trim(), phone: mobile.replace(/\D/g, "") },
      }),
    });
    const orderData = await orderResponse.json();
    if (!orderResponse.ok || !orderData?.order_id) {
      throw new Error(orderData?.error || "Could not start the payment. Please try again.");
    }

    // 2. Load the Razorpay checkout script.
    const scriptOk = await loadRazorpayScript();
    if (!scriptOk || !window.Razorpay) {
      throw new Error("Could not load the payment gateway. Check your connection and try again.");
    }

    // 3. Open the Razorpay modal.
    trackAddPaymentInfo(total, "INR");
    const rzp = new window.Razorpay({
      key: orderData.key_id,
      amount: orderData.amount,
      currency: orderData.currency,
      order_id: orderData.order_id,
      name: "Viora Jewels",
      description: "Order payment",
      image: "/logo%20compressed.png",
      prefill: {
        name: fullName.trim(),
        email: email.trim(),
        contact: mobile.replace(/\D/g, ""),
      },
      notes: { address: address.trim() },
      theme: { color: "#9B1B30" },
      handler: async (response: any) => {
        try {
          // 4. Verify the signature server-side before trusting the payment.
          const verifyResponse = await fetch("/api/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });
          const verifyData = await verifyResponse.json();
          if (!verifyResponse.ok || !verifyData?.verified) {
            throw new Error(
              "Payment verification failed. If money was deducted it will be refunded automatically."
            );
          }

          // 5. Payment confirmed — finalize the Wix order and finish up.
          const wixOrderId = await finalizeWixOrder("PREPAID", response.razorpay_payment_id);
          completeOrder(wixOrderId, contentIds);
        } catch (err: any) {
          console.error("Prepaid order finalization failed:", err);
          setError(
            `Payment received but order could not be completed: ${
              err?.message || "Unknown error"
            }. Please contact support with your payment ID.`
          );
          showToast("Could not complete order after payment", "error");
          setProcessing(false);
        }
      },
      modal: {
        // User dismissed the Razorpay window without paying.
        ondismiss: () => {
          setProcessing(false);
          showToast("Payment cancelled.", "info");
        },
      },
    });

    rzp.on("payment.failed", (resp: any) => {
      console.error("Razorpay payment.failed:", resp?.error);
      setError(`Payment failed: ${resp?.error?.description || "Please try again."}`);
      showToast("Payment failed", "error");
      setProcessing(false);
    });

    rzp.open();
  };

  const handlePayment = async () => {
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

    const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || fullName.trim();
    const lastName = nameParts.slice(1).join(" ") || undefined;

    setMetaUserData({
      email: email.trim(),
      phone: mobile,
      firstName,
      lastName,
      city: city.trim(),
      state: state.trim(),
      zip: pincode.trim(),
      country: "IN",
    });

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
      if (paymentMethod === "PREPAID") {
        // Razorpay flow keeps `processing` true until its callbacks resolve.
        await runPrepaidOrder(contentIds);
        return;
      }

      // COD flow: finalize the Wix order immediately. Wix keeps it as "Pending
      // Payment" per the Manual Payments config — mark it paid in the dashboard
      // once cash is collected.
      const wixOrderId = await finalizeWixOrder("COD");
      completeOrder(wixOrderId, contentIds);
    } catch (err: any) {
      // Surface the full Wix/Razorpay error so it can be debugged.
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
    { id: "PREPAID", label: "Prepaid (UPI / Cards)", sub: `Pay online & save ₹${PREPAID_DISCOUNT} instantly` },
  ];

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/55 md:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
      // Tell Lenis (global smooth-scroll) to ignore gestures inside the modal so
      // the panel scrolls natively instead of scrolling the page behind it.
      data-lenis-prevent
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

        <div className="bg-green-600 text-white text-center text-sm font-semibold py-2 px-4">
          Get Extra ₹{PREPAID_DISCOUNT} Off on Prepaid Payments
        </div>

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
                    maxLength={100}
                    className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                  />
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Address Line 1 (house, street)"
                    maxLength={120}
                    className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                  />
                  <input
                    type="text"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    placeholder="Address Line 2 (landmark, area) — optional"
                    maxLength={120}
                    className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                      maxLength={50}
                      className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                    />
                    <select
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20 bg-white"
                    >
                      <option value="">Select State</option>
                      {INDIAN_SUBDIVISIONS.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Pincode"
                      inputMode="numeric"
                      maxLength={10}
                      className="rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                    />
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Phone (10 digits)"
                      inputMode="numeric"
                      autoComplete="tel"
                      pattern="[0-9]{10}"
                      maxLength={10}
                      title="Enter a 10-digit mobile number"
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
                    const isPrepaid = opt.id === "PREPAID";
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
                            {isPrepaid && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider bg-green-100 text-green-800 border border-green-200 rounded-full px-2 py-0.5">
                                ₹{PREPAID_DISCOUNT} OFF
                              </span>
                            )}
                          </span>
                          {opt.sub && (
                            <span className="block text-xs mt-0.5 text-gray-500">
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
                    You are saving ₹{(149 + wixCouponDiscount + prepaidDiscount).toFixed(0)} on this order!
                  </p>
                </div>

                {/* Coupon code */}
                <div className="pt-2">
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
                        disabled={removingCoupon || processing}
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
                          placeholder="ENTER CODE"
                          autoFocus
                          className="flex-1 min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs tracking-wider uppercase outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
                        />
                        <button
                          type="button"
                          onClick={handleApplyCoupon}
                          disabled={applyingCoupon || !couponCode.trim() || processing}
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
                          <p className={`text-[11px] ${amountToUnlockClub > 0 ? "text-gray-500" : "text-green-600 font-medium"}`}>
                            {amountToUnlockClub > 0 ? (
                              <>Add ₹{amountToUnlockClub.toFixed(0)} more to use <span className="font-semibold tracking-wider">{CLUB_VIORA_CODE}</span> (10% off).</>
                            ) : (
                              <>✅ Eligible! Use <span className="font-semibold tracking-wider">{CLUB_VIORA_CODE}</span> for 10% off.</>
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {wixCouponDiscount > 0 && (
                  <div className="flex justify-between text-green-700 font-medium pt-2">
                    <span>
                      Coupon{appliedCouponCode ? ` (${appliedCouponCode})` : ""}
                    </span>
                    <span>- ₹{wixCouponDiscount.toFixed(2)}</span>
                  </div>
                )}

                {isPrepaid && (
                  <div className="flex justify-between text-green-700 font-medium">
                    <span>Prepaid Discount</span>
                    <span>- ₹{PREPAID_DISCOUNT}</span>
                  </div>
                )}
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
