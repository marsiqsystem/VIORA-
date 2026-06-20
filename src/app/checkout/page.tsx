"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { currentCart } from "@wix/ecom";
import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";
import { trackMetaEvent, setMetaUserData } from "@/lib/metaEvents";
import { trackAddPaymentInfo } from "@/lib/metaPixel";
import BackButton from "@/components/BackButton";

type AddressForm = {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  subdivision: string;
  postalCode: string;
};

type BillingForm = AddressForm & {
  email: string;
};

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

const emptyAddress: AddressForm = {
  fullName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  subdivision: "",
  postalCode: "",
};

const emptyBilling: BillingForm = {
  ...emptyAddress,
  email: "",
};

const splitName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || fullName.trim(),
    lastName: parts.slice(1).join(" ") || undefined,
  };
};

const normalizePhone = (raw: string) => raw.replace(/\D/g, "").slice(-10);

const toWixAddressWithContact = (form: AddressForm) => {
  const name = splitName(form.fullName);

  return {
    address: {
      country: "IN",
      addressLine1: form.addressLine1.trim(),
      addressLine2: form.addressLine2.trim() || undefined,
      city: form.city.trim(),
      subdivision: form.subdivision,
      postalCode: form.postalCode.trim(),
    },
    contactDetails: {
      firstName: name.firstName,
      lastName: name.lastName,
      phone: form.phone.trim(),
    },
  };
};

const CheckoutPage = () => {
  const wixClient = useWixClient();
  const router = useRouter();
  const { cart, getCart, isLoading, updateQuantity, removeItem } = useCartStore();

  const handleQuantityChange = async (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) {
      await removeItem(wixClient, itemId);
    } else {
      await updateQuantity(wixClient, itemId, newQuantity);
    }
  };
  const [billing, setBilling] = useState<BillingForm>(emptyBilling);
  const [giftShipping, setGiftShipping] = useState<AddressForm>(emptyAddress);
  const [alternateShipping, setAlternateShipping] =
    useState<AddressForm>(emptyAddress);
  const [shipDifferent, setShipDifferent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getCart(wixClient);
  }, [getCart, wixClient]);

  const lineItems = useMemo(() => cart.lineItems || [], [cart.lineItems]);

  const isGiftOrder = useMemo(() => {
    return lineItems.some((item: any) => {
      const productName =
        item.productName?.original ||
        item.productName ||
        item.name ||
        "";
      const description = JSON.stringify(item.descriptionLines || []);
      return /premium gift packaging|gift packaging|gift wrap/i.test(
        `${productName} ${description}`
      );
    });
  }, [lineItems]);

  const subtotal = lineItems.reduce(
    (sum: number, item: any) =>
      sum + (Number(item.price?.amount) || 0) * (item.quantity || 1),
    0
  );

  const updateBilling = (field: keyof BillingForm, value: string) => {
    setBilling((prev) => ({ ...prev, [field]: value }));
  };

  const updateGiftShipping = (field: keyof AddressForm, value: string) => {
    setGiftShipping((prev) => ({ ...prev, [field]: value }));
  };

  const updateAlternateShipping = (field: keyof AddressForm, value: string) => {
    setAlternateShipping((prev) => ({ ...prev, [field]: value }));
  };

  const validatePhone = (raw: string) => normalizePhone(raw).length === 10;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!lineItems.length) {
      router.push("/cart");
      return;
    }

    const shippingForm = isGiftOrder
      ? giftShipping
      : shipDifferent
        ? alternateShipping
        : billing;

    if (!validatePhone(billing.phone)) {
      setError("Please enter a valid 10-digit phone number for the buyer.");
      return;
    }
    if ((isGiftOrder || shipDifferent) && !validatePhone(shippingForm.phone)) {
      setError("Please enter a valid 10-digit recipient phone number.");
      return;
    }

    setSubmitting(true);

    try {
      const shippingAddress = toWixAddressWithContact(shippingForm);
      const billingAddress = toWixAddressWithContact(billing);

      window.localStorage.setItem(
        "vioraCheckoutShipping",
        JSON.stringify({
          isGiftOrder,
          billingAddress,
          shippingAddress,
        })
      );

      const nameParts = splitName(billing.fullName);
      setMetaUserData({
        email: billing.email.trim(),
        phone: billing.phone,
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        country: "IN",
      });

      trackMetaEvent("InitiateCheckout", {
        currency: "INR",
        value: subtotal,
        content_ids: lineItems
          .map((item: any) => item.catalogReference?.catalogItemId)
          .filter(Boolean),
        content_type: "product",
        contents: lineItems.map((item: any) => ({
          id: item.catalogReference?.catalogItemId || item._id || "",
          quantity: item.quantity || 1,
          item_price: Number(item.price?.amount) || 0,
        })),
        num_items: lineItems.reduce(
          (sum: number, item: any) => sum + (item.quantity || 1),
          0
        ),
      });

      const checkout = await wixClient.currentCart.createCheckoutFromCurrentCart({
        channelType: currentCart.ChannelType.WEB,
      });

      if (checkout.checkoutId && (wixClient as any).checkout?.updateCheckout) {
        await (wixClient as any).checkout.updateCheckout(checkout.checkoutId, {
          _id: checkout.checkoutId,
          billingInfo: billingAddress,
          shippingInfo: {
            shippingDestination: shippingAddress,
          },
          buyerInfo: {
            email: billing.email.trim(),
          },
          buyerNote: isGiftOrder
            ? `Gift order. Recipient phone: ${shippingForm.phone.trim()}. Shipping address is for the gift recipient and billing address is for the buyer.`
            : shipDifferent
              ? `Ship to alternate address. Recipient phone: ${shippingForm.phone.trim()}.`
              : `Billing and shipping address are the same. Phone: ${shippingForm.phone.trim()}.`,
          customFields: [
            {
              title: "Checkout Type",
              value: isGiftOrder ? "Gift order" : "Standard order",
            },
            {
              title: "Shipping Recipient Phone",
              value: shippingForm.phone.trim(),
            },
          ],
        });
      }

      const { redirectSession } =
        await wixClient.redirects.createRedirectSession({
          ecomCheckout: { checkoutId: checkout.checkoutId },
          callbacks: {
            postFlowUrl: window.location.origin,
            thankYouPageUrl: `${window.location.origin}/success`,
          },
        });

      if (redirectSession?.fullUrl) {
        trackAddPaymentInfo(subtotal, "INR");
        try {
          window.sessionStorage.setItem(
            "vioraPendingPurchase",
            JSON.stringify({
              value: subtotal,
              currency: "INR",
              content_ids: lineItems
                .map((item: any) => item.catalogReference?.catalogItemId)
                .filter(Boolean),
            })
          );
        } catch {}
        window.location.href = redirectSession.fullUrl;
        return;
      }

      setError("Checkout could not be opened. Please try again.");
    } catch (err) {
      console.error("Checkout failed:", err);
      setError("We could not prepare checkout. Please check the details and try again.");
    }

    setSubmitting(false);
  };

  if (isLoading && !lineItems.length) {
    return (
      <main className="min-h-[calc(100vh-180px)] bg-platinum px-4 py-16">
        <div className="mx-auto max-w-3xl rounded-xl bg-white p-8 text-center shadow-premium">
          <div className="loading-spinner mx-auto" />
          <p className="mt-4 text-sm text-gray-600">Preparing checkout...</p>
        </div>
      </main>
    );
  }

  if (!lineItems.length) {
    return (
      <main className="min-h-[calc(100vh-180px)] bg-platinum px-4 py-16">
        <div className="mx-auto max-w-3xl rounded-xl bg-white p-8 text-center shadow-premium">
          <h1 className="font-playfair text-3xl font-bold text-primary">
            Your cart is empty
          </h1>
          <p className="mt-2 text-gray-600">
            Add a piece before continuing to checkout.
          </p>
          <Link href="/list" className="btn-primary mt-6">
            Continue Shopping
          </Link>
        </div>
      </main>
    );
  }

  const renderAddressFields = (
    form: AddressForm,
    update: (field: keyof AddressForm, value: string) => void,
    opts: { variant?: "default" | "gift" } = {}
  ) => {
    const inputBg = opts.variant === "gift" ? "input bg-white" : "input";
    return (
      <>
        <label className="block md:col-span-2">
          <span className="mb-2 block text-sm font-medium text-gray-700">
            Address Line 1
          </span>
          <input
            required
            maxLength={120}
            value={form.addressLine1}
            onChange={(e) => update("addressLine1", e.target.value)}
            className={inputBg}
            placeholder="House number, building, street"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="mb-2 block text-sm font-medium text-gray-700">
            Address Line 2 <span className="text-xs text-gray-400">(optional)</span>
          </span>
          <input
            maxLength={120}
            value={form.addressLine2}
            onChange={(e) => update("addressLine2", e.target.value)}
            className={inputBg}
            placeholder="Landmark, area, locality"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">
            City
          </span>
          <input
            required
            maxLength={50}
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            className={inputBg}
            placeholder="City"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">
            State
          </span>
          <select
            required
            value={form.subdivision}
            onChange={(e) => update("subdivision", e.target.value)}
            className={inputBg}
          >
            <option value="">Select state</option>
            {INDIAN_SUBDIVISIONS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">
            PIN Code
          </span>
          <input
            required
            maxLength={10}
            inputMode="numeric"
            value={form.postalCode}
            onChange={(e) => update("postalCode", e.target.value)}
            className={inputBg}
            placeholder="6-digit PIN"
          />
        </label>
      </>
    );
  };

  return (
    <main className="min-h-[calc(100vh-180px)] bg-platinum px-4 py-10 md:px-8 lg:px-16 xl:px-32">
      <form
        onSubmit={handleSubmit}
        className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_360px]"
      >
        <div className="space-y-6">
          {/* TASK 1: Back button */}
          <div className="flex items-center gap-2">
            <BackButton className="bg-white shadow-sm hover:shadow-md" />
            <span className="text-sm text-gray-500">Back</span>
          </div>

          <section className="rounded-xl border border-silver-light bg-white p-6 shadow-premium md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
              Secure checkout
            </p>
            <h1 className="mt-2 font-playfair text-3xl font-bold text-primary md:text-4xl">
              Billing Details
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              These details belong to the person paying for the order.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700">
                  Buyer Full Name
                </span>
                <input
                  required
                  maxLength={100}
                  value={billing.fullName}
                  onChange={(e) => updateBilling("fullName", e.target.value)}
                  className="input"
                  placeholder="Your full name"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700">
                  Buyer Phone Number
                </span>
                <input
                  required
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  value={billing.phone}
                  onChange={(e) =>
                    updateBilling("phone", e.target.value.replace(/\D/g, ""))
                  }
                  className="input"
                  placeholder="10-digit mobile number"
                  title="Enter a 10-digit mobile number"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-gray-700">
                  Email
                </span>
                <input
                  required
                  type="email"
                  maxLength={120}
                  value={billing.email}
                  onChange={(e) => updateBilling("email", e.target.value)}
                  className="input"
                  placeholder="john@example.com"
                />
              </label>
              {renderAddressFields(billing, (field, value) =>
                updateBilling(field as keyof BillingForm, value)
              )}
            </div>
          </section>

          {isGiftOrder ? (
            <section className="rounded-xl border border-accent/30 bg-gradient-to-br from-white via-platinum to-silver-light/60 p-6 shadow-premium-hover md:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                Gift delivery
              </p>
              <h2 className="mt-2 font-playfair text-3xl font-bold leading-tight text-primary md:text-4xl">
                Let&apos;s surprise your loved one! 🎁 Where should we send the gift?
              </h2>
              <p className="mt-3 text-sm text-gray-700">
                This shipping address is separate from the billing address above.
              </p>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700">
                    Recipient&apos;s Full Name
                  </span>
                  <input
                    required
                    maxLength={100}
                    value={giftShipping.fullName}
                    onChange={(e) =>
                      updateGiftShipping("fullName", e.target.value)
                    }
                    className="input bg-white"
                    placeholder="Recipient name"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700">
                    Recipient&apos;s Phone Number
                  </span>
                  <input
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    value={giftShipping.phone}
                    onChange={(e) =>
                      updateGiftShipping("phone", e.target.value.replace(/\D/g, ""))
                    }
                    className="input bg-white"
                    placeholder="10-digit mobile number"
                    title="Enter a 10-digit mobile number"
                  />
                  <span className="mt-1 block text-xs text-gray-500">
                    Crucial for delivery updates and courier coordination.
                  </span>
                </label>
                {renderAddressFields(giftShipping, updateGiftShipping, {
                  variant: "gift",
                })}
              </div>
            </section>
          ) : (
            <section className="rounded-xl border border-silver-light bg-white p-6 shadow-premium md:p-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                    Shipping
                  </p>
                  <h2 className="mt-2 font-playfair text-3xl font-bold text-primary">
                    Delivery Address
                  </h2>
                  <p className="mt-2 text-sm text-gray-600">
                    Billing and shipping are the same by default.
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-3 rounded-full border border-silver-light px-4 py-2 text-sm font-medium text-primary">
                  <input
                    type="checkbox"
                    checked={shipDifferent}
                    onChange={(e) => setShipDifferent(e.target.checked)}
                    className="h-4 w-4 accent-[#9B1B30]"
                  />
                  Ship to a different address?
                </label>
              </div>

              {shipDifferent && (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700">
                      Recipient Full Name
                    </span>
                    <input
                      required
                      maxLength={100}
                      value={alternateShipping.fullName}
                      onChange={(e) =>
                        updateAlternateShipping("fullName", e.target.value)
                      }
                      className="input"
                      placeholder="Recipient name"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700">
                      Recipient Phone Number
                    </span>
                    <input
                      required
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]{10}"
                      maxLength={10}
                      value={alternateShipping.phone}
                      onChange={(e) =>
                        updateAlternateShipping(
                          "phone",
                          e.target.value.replace(/\D/g, "")
                        )
                      }
                      className="input"
                      placeholder="10-digit mobile number"
                      title="Enter a 10-digit mobile number"
                    />
                  </label>
                  {renderAddressFields(alternateShipping, updateAlternateShipping)}
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="h-max rounded-xl border border-silver-light bg-white p-6 shadow-premium lg:sticky lg:top-28">
          <h2 className="font-playfair text-2xl font-bold text-primary">
            Order Summary
          </h2>
          <div className="mt-5 space-y-5">
            {lineItems.map((item: any) => (
              <div key={item._id} className="flex gap-4 text-sm group relative">
                {/* Product Image (Optional space, if they have an image in lineItems. Here just aligning content) */}
                <div className="flex-1 flex flex-col justify-between">
                  <div className="flex justify-between gap-4 mb-2">
                    <span className="line-clamp-2 text-gray-700 font-medium">
                      {item.productName?.original || "Viora item"}
                    </span>
                    <span className="font-semibold text-primary whitespace-nowrap">
                      ₹{item.price?.amount || "0"}
                    </span>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center border border-gray-200 rounded-md overflow-hidden bg-white">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(item._id, (item.quantity || 1) - 1)}
                        disabled={isLoading}
                        className="px-2.5 py-1 text-gray-500 hover:bg-gray-50 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-xs font-semibold text-gray-700">
                        {item.quantity || 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(item._id, (item.quantity || 1) + 1)}
                        disabled={isLoading}
                        className="px-2.5 py-1 text-gray-500 hover:bg-gray-50 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(wixClient, item._id)}
                      disabled={isLoading}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Remove item"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-3 text-sm">
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

          <div className="mt-4 flex items-center gap-1.5 bg-green-50/50 p-2.5 rounded-lg border border-green-100">
            <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-green-600 text-sm font-medium">
              You are saving ₹149 on this order!
            </p>
          </div>

          <div className="mt-5 border-t border-silver-light pt-5">
            <div className="flex justify-between text-base font-semibold text-primary">
              <span>Estimated Total</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              Shipping and taxes are confirmed in the final Wix checkout step.
            </p>
          </div>

          {isGiftOrder && (
            <div className="mt-5 rounded-lg bg-accent/5 p-4 text-sm text-primary">
              Gift order detected. Recipient delivery details will be kept
              separate from buyer billing details.
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full rounded-lg bg-primary px-6 py-4 text-sm font-semibold uppercase tracking-wider text-white transition-colors hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Preparing Checkout..." : "Continue to Payment"}
          </button>
        </aside>
      </form>
    </main>
  );
};

export default CheckoutPage;
