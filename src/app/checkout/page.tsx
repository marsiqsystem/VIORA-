"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { currentCart } from "@wix/ecom";
import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";
import { trackMetaEvent } from "@/lib/metaEvents";
import { trackAddPaymentInfo } from "@/lib/metaPixel";

type AddressForm = {
  fullName: string;
  phone: string;
  address: string;
};

type BillingForm = AddressForm & {
  email: string;
};

const emptyAddress: AddressForm = {
  fullName: "",
  phone: "",
  address: "",
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

const toWixAddressWithContact = (form: AddressForm) => {
  const name = splitName(form.fullName);

  return {
    address: {
      country: "IN",
      addressLine1: form.address.trim(),
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
  const { cart, getCart, isLoading } = useCartStore();
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

  return (
    <main className="min-h-[calc(100vh-180px)] bg-platinum px-4 py-10 md:px-8 lg:px-16 xl:px-32">
      <form
        onSubmit={handleSubmit}
        className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_360px]"
      >
        <div className="space-y-6">
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
                  value={billing.phone}
                  onChange={(e) => updateBilling("phone", e.target.value)}
                  className="input"
                  placeholder="+91 9876543210"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-gray-700">
                  Email
                </span>
                <input
                  required
                  type="email"
                  value={billing.email}
                  onChange={(e) => updateBilling("email", e.target.value)}
                  className="input"
                  placeholder="john@example.com"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-gray-700">
                  Billing Address
                </span>
                <textarea
                  required
                  rows={3}
                  value={billing.address}
                  onChange={(e) => updateBilling("address", e.target.value)}
                  className="input resize-none"
                  placeholder="House number, street, city, state and PIN code"
                />
              </label>
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
                    value={giftShipping.phone}
                    onChange={(e) =>
                      updateGiftShipping("phone", e.target.value)
                    }
                    className="input bg-white"
                    placeholder="+91 9876543210"
                  />
                  <span className="mt-1 block text-xs text-gray-500">
                    Crucial for delivery updates and courier coordination.
                  </span>
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-gray-700">
                    Full Shipping Address
                  </span>
                  <textarea
                    required
                    rows={4}
                    value={giftShipping.address}
                    onChange={(e) =>
                      updateGiftShipping("address", e.target.value)
                    }
                    className="input resize-none bg-white"
                    placeholder="Recipient house number, street, city, state and PIN code"
                  />
                </label>
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
                      value={alternateShipping.phone}
                      onChange={(e) =>
                        updateAlternateShipping("phone", e.target.value)
                      }
                      className="input"
                      placeholder="+91 9876543210"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="mb-2 block text-sm font-medium text-gray-700">
                      Shipping Address
                    </span>
                    <textarea
                      required
                      rows={4}
                      value={alternateShipping.address}
                      onChange={(e) =>
                        updateAlternateShipping("address", e.target.value)
                      }
                      className="input resize-none"
                      placeholder="House number, street, city, state and PIN code"
                    />
                  </label>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="h-max rounded-xl border border-silver-light bg-white p-6 shadow-premium lg:sticky lg:top-28">
          <h2 className="font-playfair text-2xl font-bold text-primary">
            Order Summary
          </h2>
          <div className="mt-5 space-y-4">
            {lineItems.map((item: any) => (
              <div key={item._id} className="flex justify-between gap-4 text-sm">
                <span className="line-clamp-2 text-gray-600">
                  {item.productName?.original || "Viora item"} x {item.quantity || 1}
                </span>
                <span className="font-semibold text-primary">
                  Rs. {item.price?.amount || "0"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-2 text-sm">
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

          {(() => {
            const mrpSavings = lineItems.reduce((s: number, item: any) => {
              const fullPrice =
                Number(item.fullPrice?.amount) || Number(item.price?.amount) || 0;
              const currentPrice = Number(item.price?.amount) || 0;
              return s + (fullPrice - currentPrice) * (item.quantity || 1);
            }, 0);
            const totalSavings = 149 + mrpSavings;
            return (
              <p className="mt-3 text-green-700 text-sm font-medium">
                ✅ You are saving ₹{totalSavings.toFixed(0)} on this order!
              </p>
            );
          })()}

          <div className="mt-5 border-t border-silver-light pt-5">
            <div className="flex justify-between text-base font-semibold">
              <span>Estimated Total</span>
              <span>Rs. {subtotal.toFixed(2)}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
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
