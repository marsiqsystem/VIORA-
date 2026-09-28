"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { media as wixMedia } from "@wix/sdk";
import { currentCart } from "@wix/ecom";
import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";
import { useCommerceUi } from "@/hooks/useCommerceUi";
import { useAutoLadderCoupon } from "@/hooks/useAutoLadderCoupon";
import { useSocialProof } from "@/hooks/useSocialProof";
import { useToast } from "@/components/Toast";
import {
  trackAddPaymentInfo,
  trackInitiateCheckout,
} from "@/lib/metaPixel";
import { trackMetaEvent, setMetaUserData, hasMarketingConsent } from "@/lib/metaEvents";
import { trackGa4Purchase } from "@/lib/ga4";
import {
  COD_CHARGE,
  PREPAID_DISCOUNT,
  REVIEW_REWARD,
  fallbackCouponDiscount,
} from "@/lib/checkoutPricing";
import {
  automaticDiscountTotal,
  estimatedCouponTotal,
  useCartEstimate,
} from "@/hooks/useCartEstimate";
import { loadRazorpayScript } from "@/lib/razorpayClient";
import { INDIAN_STATES } from "@/lib/indiaStates";
import { deliveryWindowLabel, latestDeliveryLabel } from "@/lib/deliveryEstimate";
import { suggestEmail } from "@/lib/emailSuggest";
import { SOCIAL_PROOF_MIN_ORDERS } from "@/lib/socialProof";
import { isServiceLine, lowStockLeft, rupees } from "@/lib/cartLines";
import ClubVioraProgress from "./ClubVioraProgress";
import CheckoutUpsell from "./CheckoutUpsell";
import FestiveCountdown from "./FestiveCountdown";

type PaymentMethod = "PREPAID" | "COD";
type Field = "phone" | "pincode" | "fullName" | "address" | "city" | "state" | "email" | "codConfirm";

// Top-to-bottom order of the form, for scrolling to the first error.
const FIELD_ORDER: Field[] = ["phone", "pincode", "fullName", "address", "city", "state", "email", "codConfirm"];

interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
}

// SHINE50 DISABLED 2026-08-17 (deleted from Wix while Rakhi set is live). To re-enable,
// add it to COUPON_TIERS in src/lib/checkoutPricing.ts.

// ---- Remembered details (this device only) ----------------------------------
const DETAILS_KEY = "viora_checkout_details_v1";

type SavedDetails = {
  phone: string;
  pincode: string;
  fullName: string;
  address: string;
  landmark: string;
  city: string;
  state: string;
  email: string;
};

const readSavedDetails = (): Partial<SavedDetails> => {
  try {
    return JSON.parse(window.localStorage.getItem(DETAILS_KEY) || "{}");
  } catch {
    return {};
  }
};
const writeSavedDetails = (details: SavedDetails) => {
  try {
    window.localStorage.setItem(DETAILS_KEY, JSON.stringify(details));
  } catch {}
};
const clearSavedDetails = () => {
  try {
    window.localStorage.removeItem(DETAILS_KEY);
  } catch {}
};

// ---- Field helpers ----------------------------------------------------------

// Pasted numbers often carry +91, 0091 or a leading 0. Strip those prefixes only
// at the lengths they produce; anything else keeps its first 10 digits, so an
// extra keystroke never shifts a real number.
const normalizeIndianMobile = (raw: string) => {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 14 && digits.startsWith("0091")) digits = digits.slice(4);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
};

const isValidMobile = (phone: string) => /^[6-9]\d{9}$/.test(phone);
const isValidPincode = (pin: string) => /^[1-9]\d{5}$/.test(pin);
const isValidEmail = (email: string) => /^\S+@\S+\.\S+$/.test(email);

type FormValues = {
  phone: string;
  pincode: string;
  fullName: string;
  address: string;
  city: string;
  state: string;
  email: string;
  paymentMethod: PaymentMethod;
  codCommitted: boolean;
};

const validateFields = (v: FormValues): Partial<Record<Field, string>> => {
  const errors: Partial<Record<Field, string>> = {};
  if (!isValidMobile(v.phone)) errors.phone = "Enter a valid 10-digit mobile number.";
  if (!isValidPincode(v.pincode)) errors.pincode = "Enter a valid 6-digit pincode.";
  if (!v.fullName.trim()) errors.fullName = "Enter your full name.";
  if (v.address.trim().length < 5) errors.address = "Enter your house number and street.";
  if (!v.city.trim()) errors.city = "Enter your city.";
  if (!v.state) errors.state = "Select your state.";
  if (!isValidEmail(v.email.trim())) errors.email = "Enter a valid email for your invoice.";
  if (v.paymentMethod === "COD" && !v.codCommitted) {
    errors.codConfirm = "Please confirm you'll be available to pay on delivery.";
  }
  return errors;
};

// 16px text on inputs — anything smaller makes iOS Safari zoom the page on focus.
const inputClass = (hasError: boolean) =>
  `w-full rounded-lg border px-4 py-3 text-base outline-none focus:ring-2 ${
    hasError
      ? "border-red-400 focus:border-red-500 focus:ring-red-200"
      : "border-gray-300 focus:border-[#9B1B30] focus:ring-[#9B1B30]/20"
  }`;

const FieldError = ({ message }: { message?: string }) =>
  message ? (
    <p role="alert" className="mt-1 text-xs text-red-600">
      {message}
    </p>
  ) : null;

const LockIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 11h14v10H5zM8 11V7a4 4 0 018 0v4" />
  </svg>
);

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
  const { autoAppliedCode, setShopperChoseCoupon, setAutoAppliedCode } = useCommerceUi();
  const { showToast } = useToast();
  const socialProof = useSocialProof();
  const [mounted, setMounted] = useState(false);

  // Details — phone first (COD, WhatsApp and the courier all run on it), email last.
  const [phone, setPhone] = useState("");
  const [pincode, setPincode] = useState("");
  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const fieldRefs = useRef<Partial<Record<Field, HTMLInputElement | HTMLSelectElement | null>>>({});
  const [pincodeStatus, setPincodeStatus] = useState<"idle" | "loading" | "found" | "notFound">("idle");
  const [deliveryLabel, setDeliveryLabel] = useState("");
  const autoFilledArea = useRef({ city: "", state: "" });
  const [rememberDetails, setRememberDetails] = useState(true);
  const [remindOnWhatsApp, setRemindOnWhatsApp] = useState(true);
  const detailsLoaded = useRef(false);
  const leadSaved = useRef(false);

  // Prepaid is the default to push online payments (fewer COD orders → lower RTO).
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PREPAID");
  // COD commitment: a small, explicit promise to be home and pay — cuts refusals.
  const [codCommitted, setCodCommitted] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [showCouponInput, setShowCouponInput] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [removingCoupon, setRemovingCoupon] = useState(false);
  // "Don't miss out" prompt, shown once per visit when someone tries to leave.
  const [showExitPrompt, setShowExitPrompt] = useState(false);
  const exitPromptShown = useRef(false);
  const requestCloseRef = useRef<() => void>(() => onClose());

  const autoCoupon = useAutoLadderCoupon(open);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setError("");
      setProcessing(false);
      setShowExitPrompt(false);
      exitPromptShown.current = false;

      // Returning shopper on this device: bring back what they typed last time.
      if (!detailsLoaded.current) {
        detailsLoaded.current = true;
        const saved = readSavedDetails();
        if (saved.phone) setPhone((v) => v || saved.phone!);
        if (saved.pincode) setPincode((v) => v || saved.pincode!);
        if (saved.fullName) setFullName((v) => v || saved.fullName!);
        if (saved.address) setAddress((v) => v || saved.address!);
        if (saved.landmark) setLandmark((v) => v || saved.landmark!);
        if (saved.city) setCity((v) => v || saved.city!);
        if (saved.state) setState((v) => v || saved.state!);
        if (saved.email) setEmail((v) => v || saved.email!);
      }

      // Logged-in members: prefill from their account without overwriting anything typed.
      if (wixClient.auth.loggedIn()) {
        (async () => {
          try {
            const memberRes: any = await (wixClient as any).members?.getCurrentMember?.({
              fieldsets: ["FULL"],
            });
            const member = memberRes?.member;
            const memberEmail = member?.loginEmail || member?.contact?.emails?.[0] || "";
            if (memberEmail) setEmail((prev) => prev || memberEmail);
            const memberName = [member?.contact?.firstName, member?.contact?.lastName].filter(Boolean).join(" ");
            if (memberName) setFullName((prev) => prev || memberName);
            const memberPhone = normalizeIndianMobile(String(member?.contact?.phones?.[0] || ""));
            if (isValidMobile(memberPhone)) setPhone((prev) => prev || memberPhone);
          } catch (e) {
            console.warn("Could not load current member details:", e);
          }
        })();
      }
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, wixClient]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Remember details on this device as they're typed (so a closed modal or a
  // later visit doesn't mean starting again). Unticking forgets them.
  useEffect(() => {
    if (!open || !detailsLoaded.current) return;
    const details = { phone, pincode, fullName, address, landmark, city, state, email };
    if (!rememberDetails) clearSavedDetails();
    else if (Object.values(details).some(Boolean)) writeSavedDetails(details);
  }, [open, rememberDetails, phone, pincode, fullName, address, landmark, city, state, email]);

  // Pincode -> city + state (India Post), plus the delivery window.
  useEffect(() => {
    if (!open || !isValidPincode(pincode)) {
      setPincodeStatus("idle");
      return;
    }
    let cancelled = false;
    setPincodeStatus("loading");
    fetch(`/api/pincode?pin=${pincode}`)
      .then((res) => res.json())
      .then((info) => {
        if (cancelled) return;
        setDeliveryLabel(deliveryWindowLabel());
        if (!info?.ok) {
          setPincodeStatus("notFound");
          return;
        }
        setPincodeStatus("found");
        // Fill city/state unless the shopper typed their own.
        const previous = autoFilledArea.current;
        setCity((prev) => (!prev || prev === previous.city ? info.city : prev));
        if (info.state) setState((prev) => (!prev || prev === previous.state ? info.state : prev));
        autoFilledArea.current = { city: info.city, state: info.state || "" };
        setErrors((e) => ({ ...e, pincode: undefined, city: undefined, state: undefined }));
      })
      .catch(() => {
        if (!cancelled) {
          setDeliveryLabel(deliveryWindowLabel());
          setPincodeStatus("notFound");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, pincode]);

  const lineItems = useMemo(() => cart.lineItems || [], [cart.lineItems]);
  const productLines = useMemo(() => lineItems.filter((li) => !isServiceLine(li)), [lineItems]);

  const subtotal = useMemo(
    () =>
      lineItems.reduce(
        (sum, item) =>
          sum + (Number(item.price?.amount) || 0) * (item.quantity || 1),
        0
      ),
    [lineItems]
  );
  // Products only — service lines (e.g. a leftover gift-wrap line) don't count.
  const itemsSubtotal = useMemo(
    () =>
      productLines.reduce(
        (sum, item) => sum + (Number(item.price?.amount) || 0) * (item.quantity || 1),
        0
      ),
    [productLines]
  );
  const mrpSavings = useMemo(
    () =>
      productLines.reduce((sum, item) => {
        const full = Number(item.fullPrice?.amount) || Number(item.price?.amount) || 0;
        const price = Number(item.price?.amount) || 0;
        return sum + Math.max(0, full - price) * (item.quantity || 1);
      }, 0),
    [productLines]
  );

  const isPrepaid = paymentMethod === "PREPAID";

  // Wix's estimate prices coupons AND automatic discounts (e.g. the festive
  // combo). The cart's coupon figure / ladder maths only cover the moment before
  // it lands — and payment waits for `estimate.ready` (see the Pay button), so
  // the amount charged always matches the Wix order.
  const estimate = useCartEstimate(open);
  const cartCouponDiscount = useMemo(() => {
    const appliedDiscounts = (cart as any)?.appliedDiscounts || [];
    return appliedDiscounts.reduce((sum: number, d: any) => {
      if (!d.coupon) return sum;
      const reported = Number(d.coupon?.amount?.amount ?? d.discountAmount?.amount ?? 0);
      return sum + (reported > 0 ? reported : fallbackCouponDiscount(d.coupon.code, subtotal));
    }, 0);
  }, [cart, subtotal]);
  const wixCouponDiscount = Math.max(estimatedCouponTotal(estimate), cartCouponDiscount);
  const automaticLines = estimate.lines.filter((l) => l.automatic);
  const automaticDiscount = automaticDiscountTotal(estimate);
  const discountedSubtotal = Math.max(0, subtotal - wixCouponDiscount - automaticDiscount);

  // Prepaid: flat ₹25 off + free delivery. COD: a ₹49 delivery + handling charge
  // (this is really added to the Wix order server-side, so the courier collects
  // it — see /api/wix/checkout). `total` is the real amount charged/collected.
  const prepaidTotal = Math.max(0, discountedSubtotal - PREPAID_DISCOUNT);
  const codTotal = discountedSubtotal + COD_CHARGE;
  const total = isPrepaid ? prepaidTotal : codTotal;
  // Difference between COD and prepaid (₹49 charge avoided + ₹25 off gained).
  const prepaidSaving = COD_CHARGE + PREPAID_DISCOUNT;
  // Only real savings: MRP discount, coupon, automatic discounts, prepaid discount.
  const totalSavings =
    mrpSavings + wixCouponDiscount + automaticDiscount + (isPrepaid ? PREPAID_DISCOUNT : 0);
  // What the same bag costs at full price — the anchor next to the real total.
  const mrpTotal = lineItems.reduce((sum, li) => {
    const full = Number(li.fullPrice?.amount) || Number(li.price?.amount) || 0;
    return sum + full * (li.quantity || 1);
  }, 0) + (isPrepaid ? 0 : COD_CHARGE);

  const appliedCouponCode = useMemo(() => {
    const appliedDiscounts = (cart as any)?.appliedDiscounts || [];
    return appliedDiscounts.find((d: any) => d.coupon)?.coupon?.code || "";
  }, [cart]);
  const emailSuggestion = suggestEmail(email);
  const lowStockLine = productLines.find((li) => lowStockLeft(li) !== null);
  const firstName = fullName.trim().split(/\s+/)[0] || "";
  const detailsComplete =
    Object.keys(
      validateFields({ phone, pincode, fullName, address, city, state, email, paymentMethod, codCommitted })
    ).length === 0;

  // Checkout reminder: once a valid number is in (and the shopper hasn't
  // unticked it), save the phone + cart so one WhatsApp reminder can go out if
  // they leave. A placed order removes it server-side.
  const leadItemsKey = productLines.map((li) => `${li._id}:${li.quantity}`).join(",");
  useEffect(() => {
    if (!open) return;
    if (!remindOnWhatsApp) {
      if (leadSaved.current && isValidMobile(phone)) {
        leadSaved.current = false;
        fetch("/api/checkout-lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, optOut: true }),
          keepalive: true,
        }).catch(() => {});
      }
      return;
    }
    if (!isValidMobile(phone) || productLines.length === 0) return;
    const timer = setTimeout(() => {
      leadSaved.current = true;
      fetch("/api/checkout-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          phone,
          name: fullName.trim(),
          email: email.trim(),
          pincode,
          subtotal: itemsSubtotal,
          items: productLines.map((li: any) => ({
            catalogReference: li.catalogReference,
            quantity: li.quantity || 1,
            name: li.productName?.original || "",
            image: li.image || "",
          })),
        }),
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, remindOnWhatsApp, phone, fullName, email, pincode, leadItemsKey]);

  // Leaving with savings or details in progress gets one honest reminder of
  // what's being walked away from.
  const hasProgress = !!(phone || pincode || fullName || address) || totalSavings > 0;
  const requestClose = () => {
    if (processing) return;
    if (!exitPromptShown.current && lineItems.length > 0 && hasProgress) {
      exitPromptShown.current = true;
      setShowExitPrompt(true);
      return;
    }
    onClose();
  };
  requestCloseRef.current = requestClose;

  if (!mounted || !open) return null;

  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setShopperChoseCoupon(true);
    setAutoAppliedCode("");
    setApplyingCoupon(true);
    await applyCoupon(wixClient, code);
    setApplyingCoupon(false);
    setCouponCode("");
  };

  const handleRemoveCoupon = async () => {
    setShopperChoseCoupon(true);
    setAutoAppliedCode("");
    setRemovingCoupon(true);
    await removeCoupon(wixClient);
    setRemovingCoupon(false);
    setShowCouponInput(false);
  };

  // Typing into a field clears its error.
  const updateField = (field: Field, setter: (value: string) => void, value: string) => {
    setter(value);
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const focusFirstError = (fieldErrors: Partial<Record<Field, string>>) => {
    const first = FIELD_ORDER.find((f) => fieldErrors[f]);
    const el = first ? fieldRefs.current[first] : null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  };

  const exitLosses = [
    totalSavings > 0 ? `₹${Math.round(totalSavings)} of savings on this order` : "",
    wixCouponDiscount > 0 && appliedCouponCode ? `${appliedCouponCode}: ₹${Math.round(wixCouponDiscount)} off` : "",
    `₹${prepaidSaving} less than cash on delivery by paying online`,
    lowStockLine ? `Only ${lowStockLeft(lowStockLine)} left of ${lowStockLine.productName?.original}` : "",
    pincodeStatus === "found" ? `Delivery by ${latestDeliveryLabel()}` : "",
  ]
    .filter(Boolean)
    .slice(0, 4);

  // Convert the current Wix cart into a finalized, approved Wix order via the
  // server route (API-key permissions). Used by both COD and prepaid flows so
  // the order lands in Wix Orders/Payments/analytics identically. For prepaid,
  // the server confirms `razorpayPaymentId` with Razorpay before marking it paid.
  // For COD, `codCharge` is applied server-side so the order total = subtotal + ₹49.
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
        // Whether the buyer opted into marketing cookies — the server uses this
        // to decide if the Meta Purchase (Conversions API) event may fire.
        marketingConsent: hasMarketingConsent(),
        details: {
          email: email.trim(),
          fullName: fullName.trim(),
          phone,
          addressLine1: address.trim(),
          addressLine2: landmark.trim(),
          city: city.trim(),
          state,
          postalCode: pincode,
          paymentMethod: method,
          razorpayPaymentId,
          // For reference only — the server records what Razorpay says was paid.
          razorpayAmount: method === "PREPAID" ? total.toFixed(2) : undefined,
          // COD delivery + handling charge to add onto the Wix order so the
          // courier collects subtotal + ₹49 (matches the total shown here).
          codCharge: method === "COD" ? COD_CHARGE : undefined,
          // Final COD amount the courier must collect (subtotal − discounts + ₹49).
          // Stamped on the order so the CRM/Velocity read it race-proof, exactly
          // like the prepaid "Amount Paid" field — independent of the draft edit.
          codAmount: method === "COD" ? total.toFixed(2) : undefined,
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
    // Reset local state synchronously so the cart icon and bag reflect the
    // empty state immediately, even if the network call hiccups.
    clearCart();
    wixClient.currentCart
      .deleteCurrentCart()
      .catch((clearErr) =>
        console.warn("Failed to delete Wix cart after order:", clearErr)
      );
    // Re-fetch in the background to keep local state honest.
    getCart(wixClient).catch(() => {});
    if (!rememberDetails) clearSavedDetails();

    try {
      window.sessionStorage.setItem(
        "vioraPendingPurchase",
        JSON.stringify({ value: total, currency: "INR", content_ids: contentIds })
      );
    } catch {}
    // Deterministic event id — the checkout API also fires this same Purchase
    // event via CAPI using the identical id, so Meta dedupes the two signals
    // instead of counting the same order twice.
    await trackMetaEvent(
      "Purchase",
      {
        value: total,
        currency: "INR",
        content_ids: contentIds,
        content_type: "product",
        transaction_id: wixOrderId,
      },
      `purchase_${wixOrderId}`
    );
    // GA4 purchase. This used to be left to the success page, but the flag above
    // made that page skip it, so GA4 never saw a purchase from this checkout.
    trackGa4Purchase({ transactionId: wixOrderId, value: total, currency: "INR", contentIds });
    try {
      window.sessionStorage.setItem(`viora_purchase_fired_${wixOrderId}`, "1");
      window.sessionStorage.setItem(`viora_ga4_purchase_fired_${wixOrderId}`, "1");
      window.sessionStorage.removeItem("vioraPendingPurchase");
    } catch {}

    // Close the modal BEFORE navigating so it doesn't keep painting over the
    // success page.
    onClose();
    // COD orders land on the pay-online offer (skip the COD charge).
    router.push(
      `/success?orderId=${encodeURIComponent(wixOrderId)}${paymentMethod === "COD" ? "&cod=1" : ""}`
    );
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
        notes: { email: email.trim(), phone },
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

    // 3. Open the Razorpay modal — UPI first, since most shoppers pay that way.
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
        contact: phone,
      },
      notes: { address: address.trim() },
      theme: { color: "#9B1B30" },
      config: {
        display: {
          blocks: {
            upi: { name: "Pay with UPI", instruments: [{ method: "upi" }] },
          },
          sequence: ["block.upi"],
          preferences: { show_default_blocks: true },
        },
      },
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
    const fieldErrors = validateFields({
      phone,
      pincode,
      fullName,
      address,
      city,
      state,
      email,
      paymentMethod,
      codCommitted,
    });
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      setError("");
      focusFirstError(fieldErrors);
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
    const first = nameParts[0] || fullName.trim();
    const lastName = nameParts.slice(1).join(" ") || undefined;

    setMetaUserData({
      email: email.trim(),
      phone,
      firstName: first,
      lastName,
      city: city.trim(),
      state,
      zip: pincode,
      country: "IN",
    });

    const contentIds = productLines
      .map((item) => item.catalogReference?.catalogItemId)
      .filter((id): id is string => !!id);

    // Total quantity across line items (not unique-item count) is what Meta
    // Pixel's num_items expects.
    const totalQuantity = productLines.reduce(
      (sum, item) => sum + (item.quantity || 1),
      0
    );

    // This is the place-order SUBMIT stage (user has entered details and is
    // confirming), so in GA4 it's add_payment_info — not a second begin_checkout.
    // Meta keeps InitiateCheckout here (unchanged) to preserve existing pixel data.
    trackInitiateCheckout(total, "INR", totalQuantity, { ga4Event: "add_payment_info" });

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
    amount: number;
    sub: string;
    badge: string;
  }> = [
    {
      id: "PREPAID",
      label: "Pay online",
      amount: prepaidTotal,
      sub: `GPay, PhonePe, Paytm, cards · FREE delivery + ₹${PREPAID_DISCOUNT} off`,
      badge: `Save ₹${prepaidSaving}`,
    },
    {
      id: "COD",
      label: "Cash on delivery",
      amount: codTotal,
      sub: `Includes ₹${COD_CHARGE} delivery & COD charge`,
      badge: `₹${prepaidSaving} more`,
    },
  ];

  const itemCount = productLines.reduce((sum, li) => sum + (li.quantity || 1), 0);
  const thumbnail = (image: string | undefined, size: number) => {
    if (!image) return null;
    try {
      return wixMedia.getScaledToFillImageUrl(image, size * 2, size * 2, {});
    } catch {
      return null;
    }
  };

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/55 md:items-center"
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
    >
      <div
        className="relative flex max-h-[95vh] w-full flex-col overflow-y-auto rounded-t-2xl bg-white shadow-2xl md:max-w-lg md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-20 border-b border-gray-100 bg-white">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              type="button"
              onClick={requestClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
              <LockIcon className="h-4 w-4 text-green-700" />
              Secure checkout
            </p>
            <span className="min-w-[2.25rem] text-right text-sm font-bold tabular-nums text-primary">
              ₹{rupees(total)}
            </span>
          </div>
          {/* Progress: the bag is done, so the shopper is already two-thirds in */}
          <ol className="flex items-center justify-center gap-2 pb-2 text-[11px] font-semibold uppercase tracking-wider" aria-label="Checkout progress">
            <li className="text-green-700">✓ Bag</li>
            <li className="text-gray-300" aria-hidden="true">—</li>
            <li className={detailsComplete ? "text-green-700" : "text-accent"}>
              {detailsComplete ? "✓ Details" : "2 Details"}
            </li>
            <li className="text-gray-300" aria-hidden="true">—</li>
            <li className={detailsComplete ? "text-accent" : "text-gray-400"}>3 Pay</li>
          </ol>
        </div>

        <p className="bg-white px-5 pt-3 text-center font-playfair text-lg font-semibold text-primary">
          {firstName ? `Almost yours, ${firstName} ✨` : "You're one step away from your order"}
        </p>

        {/* Your order */}
        <details className="group border-b border-gray-100">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex -space-x-2">
              {productLines.slice(0, 3).map((li) => {
                const src = thumbnail(li.image, 36);
                return (
                  <span key={li._id} className="relative h-9 w-9 overflow-hidden border-2 border-white bg-gray-100">
                    {src && <Image src={src} alt="" fill sizes="36px" className="object-cover" />}
                  </span>
                );
              })}
            </span>
            <span className="flex-1 text-sm text-primary">
              Your order · {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
            <span className="text-xs font-semibold text-accent group-open:hidden">Show</span>
            <span className="hidden text-xs font-semibold text-accent group-open:inline">Hide</span>
          </summary>
          <ul className="space-y-3 px-5 pb-4">
            {lineItems.map((li) => {
              const src = thumbnail(li.image, 48);
              const qty = li.quantity || 1;
              const left = lowStockLeft(li);
              return (
                <li key={li._id} className="flex items-center gap-3">
                  <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden bg-gray-100 text-lg">
                    {src ? <Image src={src} alt="" fill sizes="48px" className="object-cover" /> : "🎁"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 block text-sm text-primary">{li.productName?.original}</span>
                    <span className="text-xs text-gray-500">Qty {qty}</span>
                    {left !== null && (
                      <span className="ml-2 text-xs font-semibold text-orange-600">Only {left} left</span>
                    )}
                  </span>
                  <span className="text-sm font-medium tabular-nums">
                    ₹{rupees((Number(li.price?.amount) || 0) * qty)}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>

        {totalSavings > 0 && (
          <p className="bg-green-50 px-5 py-2 text-center text-sm font-semibold text-green-800">
            🎉 You&apos;re saving ₹{Math.round(totalSavings)} on this order
            {autoAppliedCode && (
              <span className="block text-xs font-medium text-green-700">
                {autoAppliedCode} applied automatically
              </span>
            )}
          </p>
        )}
        <FestiveCountdown />
        {socialProof.weekOrders >= SOCIAL_PROOF_MIN_ORDERS && (
          <p className="px-5 pt-2 text-center text-xs font-medium text-gray-600">
            🔥 {socialProof.weekOrders} orders placed on Viora this week
          </p>
        )}

        <div className="space-y-6 p-5">
          {/* Delivery details */}
          <section className="space-y-3">
            <h3 className="font-inter text-sm font-semibold uppercase tracking-wider text-primary">
              Delivery details
            </h3>

            <div>
              <label htmlFor="co-phone" className="text-xs font-medium text-gray-700">
                Mobile number
              </label>
              <div className="mt-1 flex">
                <span className="flex items-center rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 px-3 text-base text-gray-600">
                  +91
                </span>
                <input
                  id="co-phone"
                  ref={(el) => {
                    fieldRefs.current.phone = el;
                  }}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(e) => updateField("phone", setPhone, normalizeIndianMobile(e.target.value))}
                  placeholder="10-digit mobile number"
                  aria-invalid={!!errors.phone}
                  className={`${inputClass(!!errors.phone)} rounded-l-none`}
                />
              </div>
              <FieldError message={errors.phone} />
              <label className="mt-1.5 flex items-start gap-2 text-[11px] text-gray-500">
                <input
                  type="checkbox"
                  checked={remindOnWhatsApp}
                  onChange={(e) => setRemindOnWhatsApp(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 accent-[#9B1B30]"
                />
                Send me one WhatsApp reminder if I don&apos;t finish my order
              </label>
            </div>

            <div>
              <label htmlFor="co-pincode" className="text-xs font-medium text-gray-700">
                Pincode
              </label>
              <input
                id="co-pincode"
                ref={(el) => {
                  fieldRefs.current.pincode = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                value={pincode}
                onChange={(e) => updateField("pincode", setPincode, e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit pincode"
                aria-invalid={!!errors.pincode}
                className={`mt-1 ${inputClass(!!errors.pincode)}`}
              />
              <FieldError message={errors.pincode} />
              {pincodeStatus === "loading" && (
                <p className="mt-1 text-xs text-gray-500">Finding your area…</p>
              )}
              {pincodeStatus === "found" && (
                <p className="mt-1 text-xs font-medium text-green-700">
                  🚚 Delivery by {deliveryLabel}
                </p>
              )}
              {pincodeStatus === "notFound" && (
                <p className="mt-1 text-xs text-amber-700">
                  We couldn&apos;t look up this pincode — please check it and enter your city below.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="co-name" className="text-xs font-medium text-gray-700">
                Full name
              </label>
              <input
                id="co-name"
                ref={(el) => {
                  fieldRefs.current.fullName = el;
                }}
                type="text"
                autoComplete="name"
                maxLength={100}
                value={fullName}
                onChange={(e) => updateField("fullName", setFullName, e.target.value)}
                aria-invalid={!!errors.fullName}
                className={`mt-1 ${inputClass(!!errors.fullName)}`}
              />
              <FieldError message={errors.fullName} />
            </div>

            <div>
              <label htmlFor="co-address" className="text-xs font-medium text-gray-700">
                House no., building, street
              </label>
              <input
                id="co-address"
                ref={(el) => {
                  fieldRefs.current.address = el;
                }}
                type="text"
                autoComplete="address-line1"
                maxLength={120}
                value={address}
                onChange={(e) => updateField("address", setAddress, e.target.value)}
                aria-invalid={!!errors.address}
                className={`mt-1 ${inputClass(!!errors.address)}`}
              />
              <FieldError message={errors.address} />
              <input
                type="text"
                autoComplete="address-line2"
                maxLength={120}
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder="Area / landmark (optional)"
                className={`mt-2 ${inputClass(false)}`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="co-city" className="text-xs font-medium text-gray-700">
                  City
                </label>
                <input
                  id="co-city"
                  ref={(el) => {
                    fieldRefs.current.city = el;
                  }}
                  type="text"
                  autoComplete="address-level2"
                  maxLength={50}
                  value={city}
                  onChange={(e) => updateField("city", setCity, e.target.value)}
                  aria-invalid={!!errors.city}
                  className={`mt-1 ${inputClass(!!errors.city)}`}
                />
                <FieldError message={errors.city} />
              </div>
              <div>
                <label htmlFor="co-state" className="text-xs font-medium text-gray-700">
                  State
                </label>
                <select
                  id="co-state"
                  ref={(el) => {
                    fieldRefs.current.state = el;
                  }}
                  autoComplete="address-level1"
                  value={state}
                  onChange={(e) => updateField("state", setState, e.target.value)}
                  aria-invalid={!!errors.state}
                  className={`mt-1 bg-white ${inputClass(!!errors.state)}`}
                >
                  <option value="">Select</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.state} />
              </div>
            </div>

            <div>
              <label htmlFor="co-email" className="text-xs font-medium text-gray-700">
                Email <span className="font-normal text-gray-500">(for your invoice)</span>
              </label>
              <input
                id="co-email"
                ref={(el) => {
                  fieldRefs.current.email = el;
                }}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => updateField("email", setEmail, e.target.value)}
                aria-invalid={!!errors.email}
                className={`mt-1 ${inputClass(!!errors.email)}`}
              />
              <FieldError message={errors.email} />
              {emailSuggestion && (
                <p className="mt-1 text-xs text-gray-600">
                  Did you mean{" "}
                  <button
                    type="button"
                    onClick={() => updateField("email", setEmail, emailSuggestion)}
                    className="font-semibold text-accent underline underline-offset-2"
                  >
                    {emailSuggestion}
                  </button>
                  ?
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={rememberDetails}
                onChange={(e) => setRememberDetails(e.target.checked)}
                className="h-4 w-4 accent-[#9B1B30]"
              />
              Save these details on this device for next time
            </label>
          </section>

          {/* Payment */}
          <section className="space-y-2">
            <h3 className="font-inter text-sm font-semibold uppercase tracking-wider text-primary">Payment</h3>
            {paymentOptions.map((opt) => {
              const selected = paymentMethod === opt.id;
              const optIsPrepaid = opt.id === "PREPAID";
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPaymentMethod(opt.id)}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all ${
                    selected
                      ? "border-[#9B1B30] bg-[#9B1B30]/5 ring-2 ring-[#9B1B30]/20"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span
                    className={`h-4 w-4 flex-shrink-0 rounded-full border-2 ${
                      selected ? "border-[#9B1B30] bg-[#9B1B30]" : "border-gray-300"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-primary">{opt.label}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          optIsPrepaid
                            ? "border-green-200 bg-green-100 text-green-800"
                            : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        {opt.badge}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500">{opt.sub}</span>
                  </span>
                  <span className="text-base font-bold tabular-nums text-primary">₹{rupees(opt.amount)}</span>
                </button>
              );
            })}

            {!isPrepaid && (
              <>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("PREPAID")}
                  className="flex w-full items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-left transition-colors hover:bg-amber-100"
                >
                  <span className="text-lg leading-none">💡</span>
                  <span className="text-xs font-medium leading-snug text-amber-800">
                    Cash on delivery costs ₹{prepaidSaving} more. Pay online for ₹{rupees(prepaidTotal)} with FREE
                    delivery. <span className="underline">Switch</span>
                  </span>
                </button>
                <label
                  className={`flex items-start gap-2.5 rounded-md border p-3 text-xs ${
                    errors.codConfirm ? "border-red-300 bg-red-50" : "border-gray-200"
                  }`}
                >
                  <input
                    ref={(el) => {
                      fieldRefs.current.codConfirm = el;
                    }}
                    type="checkbox"
                    checked={codCommitted}
                    onChange={(e) => {
                      setCodCommitted(e.target.checked);
                      if (errors.codConfirm) setErrors((prev) => ({ ...prev, codConfirm: undefined }));
                    }}
                    className="mt-0.5 h-4 w-4 accent-[#9B1B30]"
                  />
                  <span className="text-primary">
                    I&apos;ll be available to receive this order and pay <b>₹{rupees(codTotal)}</b> in cash
                    on delivery.
                  </span>
                </label>
                <FieldError message={errors.codConfirm} />
              </>
            )}
          </section>

          {/* Offers & add-ons */}
          <section className="space-y-3">
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
                        You save ₹{rupees(wixCouponDiscount)}
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
                className="text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-[#9B1B30]"
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
                        handleApplyCoupon();
                      }
                    }}
                    placeholder="ENTER CODE"
                    autoFocus
                    className="flex-1 min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-base tracking-wider uppercase outline-none focus:border-[#9B1B30] focus:ring-2 focus:ring-[#9B1B30]/20"
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
                {couponError && (
                  <p className="mt-1.5 text-[11px] text-red-600">{couponError}</p>
                )}
              </div>
            )}

            <CheckoutUpsell
              subtotal={subtotal}
              couponDiscount={wixCouponDiscount}
            />
          </section>

          {/* Price breakdown */}
          <section className="space-y-1.5 rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span className="tabular-nums">₹{rupees(subtotal)}</span>
            </div>
            {wixCouponDiscount > 0 && (
              <div className="flex justify-between font-medium text-green-700">
                <span>Coupon{appliedCouponCode ? ` (${appliedCouponCode})` : ""}</span>
                <span className="tabular-nums">- ₹{rupees(wixCouponDiscount)}</span>
              </div>
            )}
            {/* Automatic discounts, e.g. the festive combo */}
            {automaticLines.map((line) => (
              <div key={line.label} className="flex justify-between font-medium text-green-700">
                <span>{line.label}</span>
                <span className="tabular-nums">- ₹{rupees(line.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between text-gray-600">
              <span>{isPrepaid ? "Delivery" : "Delivery + COD charge"}</span>
              {isPrepaid ? (
                <span className="font-semibold text-green-700">FREE</span>
              ) : (
                <span className="font-semibold text-amber-700">+ ₹{COD_CHARGE}</span>
              )}
            </div>
            {isPrepaid && (
              <div className="flex justify-between font-medium text-green-700">
                <span>Pay-online discount</span>
                <span className="tabular-nums">- ₹{PREPAID_DISCOUNT}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-gray-200 pt-3 text-base font-bold text-primary">
              <span>{isPrepaid ? "Total" : "Total (pay on delivery)"}</span>
              <span className="tabular-nums">₹{rupees(total)}</span>
            </div>
            <p className="pt-1 text-[11px] text-gray-500">
              📸 After delivery, a photo review gets you ₹{REVIEW_REWARD.amount} off your next order.
            </p>
          </section>

          {/* Global Error Display */}
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        {/* Sticky pay bar — total and the one button, always in reach */}
        <div className="sticky bottom-0 z-20 mt-auto border-t border-gray-100 bg-white px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_16px_rgba(0,0,0,0.06)]">
          {lowStockLine && (
            <p className="mb-2 text-center text-[11px] font-semibold text-orange-700">
              ⚠ Only {lowStockLeft(lowStockLine)} left of {lowStockLine.productName?.original} — order now to get yours
            </p>
          )}
          <div className="flex items-center gap-4">
            <div className="shrink-0">
              {mrpTotal > total + 1 && (
                <p className="text-[11px] tabular-nums text-gray-400 line-through">₹{rupees(mrpTotal)}</p>
              )}
              <p className="text-lg font-bold leading-tight tabular-nums text-primary">₹{rupees(total)}</p>
              <p className="text-[11px] font-medium text-green-700">
                {totalSavings > 0 ? `Saving ₹${Math.round(totalSavings)}` : isPrepaid ? "Paying online" : "Pay on delivery"}
              </p>
            </div>
            <button
              type="button"
              onClick={handlePayment}
              // Wait for Wix's discount estimate so the amount charged matches the order.
              disabled={processing || !estimate.ready}
              className="flex-1 rounded-lg bg-[#9B1B30] py-3.5 text-sm font-bold uppercase tracking-wider text-white hover:bg-[#7d1527] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {processing
                ? "Processing..."
                : !estimate.ready
                  ? "Updating total…"
                  : isPrepaid
                    ? `Pay ₹${rupees(total)} securely`
                    : "Place COD order"}
            </button>
          </div>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-gray-500">
            <LockIcon className="h-3.5 w-3.5" />
            Secured by Razorpay · 48-hr exchange ·{" "}
            {pincodeStatus === "found" ? `Arrives by ${latestDeliveryLabel()}` : "Delivery across India"}
          </p>
        </div>
      </div>

      {/* "Don't miss out" — one honest reminder of what's being left behind */}
      {showExitPrompt && (
        <div
          className="fixed inset-0 z-[10001] flex items-end justify-center bg-black/40 md:items-center"
          onClick={(e) => {
            e.stopPropagation();
            setShowExitPrompt(false);
          }}
        >
          <div
            role="alertdialog"
            aria-label="Leave checkout?"
            className="w-full rounded-t-2xl bg-white p-5 shadow-2xl md:max-w-sm md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-playfair text-2xl font-bold text-primary">Wait — don&apos;t miss out</p>
            <p className="mt-1 text-sm text-gray-600">Your bag is saved, but if you leave now you miss:</p>
            <ul className="mt-3 space-y-1.5 text-sm text-primary">
              {exitLosses.map((loss) => (
                <li key={loss} className="flex items-start gap-2">
                  <span className="mt-0.5 text-accent" aria-hidden="true">
                    ●
                  </span>
                  {loss}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setShowExitPrompt(false)}
              className="mt-5 w-full rounded-lg bg-[#9B1B30] py-3.5 text-sm font-bold uppercase tracking-wider text-white hover:bg-[#7d1527]"
            >
              Complete my order
            </button>
            <button
              type="button"
              onClick={() => {
                setShowExitPrompt(false);
                onClose();
              }}
              className="mt-2 w-full py-2 text-sm text-gray-500 underline underline-offset-2"
            >
              Leave checkout
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modal, document.body);
};

export default CheckoutModal;
