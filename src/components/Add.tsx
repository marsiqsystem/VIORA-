"use client";

import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";
import { useToast } from "@/components/Toast";
import { trackMetaEvent } from "@/lib/metaEvents";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import dynamic from "next/dynamic";
import type { AbandonedCartItem } from "@/components/BuyNowConfirmModal";
import { media as wixMedia } from "@wix/sdk";

const CheckoutModal = dynamic(() => import("@/components/CheckoutModal"), {
  ssr: false,
});

const BuyNowConfirmModal = dynamic(
  () => import("@/components/BuyNowConfirmModal"),
  { ssr: false }
);

const Add = ({
  productId,
  variantId,
  stockNumber,
  productName,
  productPrice,
  selectedOptions,
}: {
  productId: string;
  variantId: string;
  stockNumber: number;
  productName: string;
  productPrice: number;
  selectedOptions?: Record<string, string>;
}) => {
  const [localQuantity, setLocalQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isBuyingNow, setIsBuyingNow] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [abandonedItems, setAbandonedItems] = useState<AbandonedCartItem[]>([]);

  const wixClient = useWixClient();
  const router = useRouter();
  const { addItem, updateQuantity, cart, isLoading, getCart } = useCartStore();
  const { showToast } = useToast();

  const hasRealVariant =
    !!variantId && variantId !== "00000000-0000-0000-0000-000000000000";

  // Find the cart line item matching this product/variant/options combo.
  const matchingLineItem = useMemo(() => {
    const lineItems = (cart as any)?.lineItems || [];
    return lineItems.find((item: any) => {
      if (item?.catalogReference?.catalogItemId !== productId) return false;
      const opts = item?.catalogReference?.options || {};
      if (hasRealVariant) {
        if (opts.variantId !== variantId) return false;
      }
      if (selectedOptions && Object.keys(selectedOptions).length > 0) {
        const itemOpts = opts.options || {};
        for (const [k, v] of Object.entries(selectedOptions)) {
          if (itemOpts[k] !== v) return false;
        }
      }
      return true;
    });
  }, [cart, productId, variantId, hasRealVariant, selectedOptions]);

  // When the item is already in cart, the selector reflects the cart line
  // quantity and +/- updates the cart live. Otherwise it's local state for
  // the next Add-to-Cart click.
  const quantity = matchingLineItem
    ? matchingLineItem.quantity || 1
    : localQuantity;

  const handleQuantity = async (type: "i" | "d") => {
    const next =
      type === "i"
        ? Math.min(stockNumber, quantity + 1)
        : Math.max(1, quantity - 1);
    if (next === quantity) return;

    if (matchingLineItem) {
      if (type === "d" && quantity === 1) return; // floor at 1; use remove to delete
      await updateQuantity(wixClient, matchingLineItem._id, next);
    } else {
      setLocalQuantity(next);
    }
  };

  const handleAddToCart = async () => {
    setIsAdding(true);
    // Fire the Meta AddToCart signal synchronously on click — BEFORE awaiting
    // the Wix API. Waiting for the round-trip risks losing the event if the
    // user navigates away or the request hangs (and ad-blocked browsers
    // sometimes silently drop the second pixel call when it runs after a
    // long await).
    trackMetaEvent("AddToCart", {
      currency: "INR",
      value: productPrice * quantity,
      content_ids: [productId],
      content_name: productName,
      content_type: "product",
      contents: [{ id: productId, quantity, item_price: productPrice }],
      num_items: quantity,
    });
    try {
      await addItem(wixClient, productId, variantId, quantity, selectedOptions);
      setIsAdded(true);
      showToast(`${productName} added to cart!`, "success");
      setTimeout(() => setIsAdded(false), 2000);
    } catch (err) {
      console.error("Detailed Wix Cart Error:", err);
      showToast("Failed to add item to cart. Please try again.", "error");
    } finally {
      setIsAdding(false);
    }
  };

  // Returns the cart line items that belong to a DIFFERENT product than the one
  // the user is about to buy now. These are the "abandoned" items we should ask
  // about before piling them into the same checkout.
  const collectAbandonedItems = (): AbandonedCartItem[] => {
    const lineItems = (cart as any)?.lineItems || [];
    return lineItems
      .filter(
        (item: any) => item?.catalogReference?.catalogItemId !== productId
      )
      .map((item: any) => {
        const rawImage = item.image as string | undefined;
        let scaledImage: string | undefined;
        if (rawImage) {
          try {
            scaledImage = wixMedia.getScaledToFillImageUrl(rawImage, 96, 96, {});
          } catch {
            scaledImage = rawImage;
          }
        }
        return {
          id: item._id,
          name: item.productName?.original || "Item in cart",
          price: Number(item.price?.amount) || 0,
          quantity: item.quantity || 1,
          image: scaledImage,
        };
      });
  };

  // The real Buy Now flow — runs after the user has either confirmed the
  // abandoned items should stay, or after we've removed them.
  const runBuyNow = async () => {
    // Fire AddToCart synchronously BEFORE awaiting the Wix API so the Meta
    // pixel signal goes out even if the Wix call is slow / the user navigates.
    trackMetaEvent("AddToCart", {
      currency: "INR",
      value: productPrice * quantity,
      content_ids: [productId],
      content_name: productName,
      content_type: "product",
      contents: [{ id: productId, quantity, item_price: productPrice }],
      num_items: quantity,
    });

    await addItem(wixClient, productId, variantId, quantity, selectedOptions);

    const verifyCart = await wixClient.currentCart.getCurrentCart();
    if (!verifyCart?.lineItems?.length) {
      throw new Error("Cart is still empty after adding item");
    }

    trackMetaEvent("InitiateCheckout", {
      currency: "INR",
      value: productPrice * quantity,
      content_ids: [productId],
      content_name: productName,
      content_type: "product",
      contents: [{ id: productId, quantity, item_price: productPrice }],
      num_items: quantity,
    });

    setCheckoutOpen(true);
  };

  const handleBuyNow = async () => {
    if (isOutOfStock || isBuyingNow) return;

    // If the cart already has products that aren't this one, stop and ask the
    // customer whether to keep them. Avoids the surprise of paying for an
    // older "abandoned" item on top of the one they wanted right now.
    const other = collectAbandonedItems();
    if (other.length > 0) {
      setAbandonedItems(other);
      setConfirmOpen(true);
      return;
    }

    setIsBuyingNow(true);
    try {
      await runBuyNow();
    } catch (err) {
      console.error("Detailed Wix Cart Error:", err);
      showToast("Buy Now failed. Please try again.", "error");
    }
    setIsBuyingNow(false);
  };

  const handleConfirmDecision = async (decision: "yes" | "no") => {
    setIsBuyingNow(true);
    try {
      if (decision === "no") {
        // Remove the abandoned items from the Wix cart so checkout charges
        // only for the product the customer is buying right now.
        const ids = abandonedItems.map((i) => i.id).filter(Boolean);
        if (ids.length) {
          await wixClient.currentCart.removeLineItemsFromCurrentCart(ids);
          await getCart(wixClient);
        }
      }
      await runBuyNow();
      setConfirmOpen(false);
    } catch (err) {
      console.error("Buy Now confirmation failed:", err);
      showToast("Buy Now failed. Please try again.", "error");
    } finally {
      setIsBuyingNow(false);
    }
  };

  const isOutOfStock = stockNumber < 1;

  return (
    <div className="flex flex-col gap-6">
      {/* Quantity Selector */}
      <div>
        <h4 className="font-medium text-sm text-gray-700 mb-3">Quantity</h4>
        <div className="flex items-center gap-4">
          <div className="quantity-selector">
            <button
              className="quantity-btn"
              onClick={() => handleQuantity("d")}
              disabled={quantity === 1 || isOutOfStock}
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="quantity-value">{quantity}</span>
            <button
              className="quantity-btn"
              onClick={() => handleQuantity("i")}
              disabled={quantity === stockNumber || isOutOfStock}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>

          {/* Stock Status */}
          {isOutOfStock ? (
            <div className="stock-out">
              <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              Out of stock
            </div>
          ) : stockNumber < 10 ? (
            <div className="stock-low">
              <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
              Only {stockNumber} left!
            </div>
          ) : (
            <div className="stock-in">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              In stock
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Add to Cart */}
        <button
          onClick={handleAddToCart}
          disabled={isAdding || isOutOfStock}
          className={`flex-1 py-4 px-6 rounded-lg font-semibold text-sm uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 ${isAdded
              ? "bg-green-500 text-white"
              : isOutOfStock
                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                : "bg-primary text-white hover:bg-primary-light hover:shadow-lg"
            }`}
        >
          {isAdding ? (
            <>
              <svg
                className="animate-spin w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Adding...
            </>
          ) : isAdded ? (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Added to Cart!
            </>
          ) : isOutOfStock ? (
            "Out of Stock"
          ) : (
            <>
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
              Add to Cart
            </>
          )}
        </button>

        {/* Buy Now */}
        <button
          onClick={handleBuyNow}
          disabled={isOutOfStock || isBuyingNow}
          className={`flex-1 py-4 px-6 rounded-lg font-semibold text-sm uppercase tracking-wider border-2 transition-all duration-300 flex items-center justify-center gap-2 ${isOutOfStock
              ? "border-gray-200 text-gray-400 cursor-not-allowed"
              : "border-accent bg-accent text-white hover:bg-accent/90 hover:border-accent/90"
            }`}
        >
          {isBuyingNow ? (
            <>
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Redirecting...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Buy Now
            </>
          )}
        </button>
      </div>

      {/* Trust Indicators */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#1A1410]/10">
        <div className="flex items-center gap-2 text-sm text-[#1A1410]/75">
          <svg className="w-5 h-5 text-[#9B1B30]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7h11v10H3z" />
            <path d="M14 10h4l3 3v4h-7" />
            <circle cx="7.5" cy="17.5" r="1.5" />
            <circle cx="17.5" cy="17.5" r="1.5" />
          </svg>
          Free Shipping
        </div>
        <div className="flex items-center gap-2 text-sm text-[#1A1410]/75">
          <svg className="w-5 h-5 text-[#9B1B30]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v4l3 2" />
            <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          48 Hrs Exchange
        </div>
        <div className="flex items-center gap-2 text-sm text-[#1A1410]/75">
          <svg className="w-5 h-5 text-[#9B1B30]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V8a5 5 0 0110 0v3" />
          </svg>
          Secure Payment
        </div>
        <div className="flex items-center gap-2 text-sm text-[#1A1410]/75">
          <svg className="w-5 h-5 text-[#9B1B30]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l2.39 4.84 5.34.78-3.86 3.77.91 5.31L12 14.27l-4.78 2.51.91-5.31L4.27 7.62l5.34-.78L12 2z" />
          </svg>
          Quality Assured
        </div>
      </div>

      <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />

      <BuyNowConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        abandonedItems={abandonedItems}
        currentProductPrice={productPrice * quantity}
        onDecision={handleConfirmDecision}
      />
    </div>
  );
};

export default Add;

