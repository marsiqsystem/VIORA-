"use client";

import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";
import { useCommerceUi } from "@/hooks/useCommerceUi";
import { useToast } from "@/components/Toast";
import { trackMetaEvent } from "@/lib/metaEvents";
import { useMemo, useState } from "react";

import dynamic from "next/dynamic";
import type { AbandonedCartItem } from "@/components/BuyNowConfirmModal";
import { media as wixMedia } from "@wix/sdk";

const BuyNowConfirmModal = dynamic(
  () => import("@/components/BuyNowConfirmModal"),
  { ssr: false }
);

const Spinner = () => (
  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const Add = ({
  productId,
  contentId,
  variantId,
  stockNumber,
  productName,
  productPrice,
  selectedOptions,
  lowStockShownAbove = false,
}: {
  productId: string;
  // The Meta catalog Content ID (product slug). Used for content_ids on Meta
  // events so they match a catalog product; productId (the Wix GUID) is kept
  // for the actual cart operations. Falls back to productId if not provided.
  contentId?: string;
  variantId: string;
  stockNumber: number;
  productName: string;
  productPrice: number;
  selectedOptions?: Record<string, string>;
  /** The product page already shows "Only N left" above the colours. */
  lowStockShownAbove?: boolean;
}) => {
  const metaId = contentId || productId;
  const [localQuantity, setLocalQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isBuyingNow, setIsBuyingNow] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [abandonedItems, setAbandonedItems] = useState<AbandonedCartItem[]>([]);

  const wixClient = useWixClient();
  const { addItem, updateQuantity, cart, getCart } = useCartStore();
  const { openDrawer, openCheckout } = useCommerceUi();
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
      content_ids: [metaId],
      content_name: productName,
      content_type: "product",
      contents: [{ id: metaId, quantity, item_price: productPrice }],
      num_items: quantity,
    });
    try {
      await addItem(wixClient, productId, variantId, quantity, selectedOptions);
      setIsAdded(true);
      setTimeout(() => setIsAdded(false), 2000);
      // Show the bag right away: what was added, the savings, the next offer.
      openDrawer(productId);
    } catch (err) {
      console.error("Detailed Wix Cart Error:", err);
      showToast((err as any)?.message === "SOLD_OUT" ? "Sorry, this piece just sold out." : "Failed to add item to cart. Please try again.", "error");
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
      content_ids: [metaId],
      content_name: productName,
      content_type: "product",
      contents: [{ id: metaId, quantity, item_price: productPrice }],
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
      content_ids: [metaId],
      content_name: productName,
      content_type: "product",
      contents: [{ id: metaId, quantity, item_price: productPrice }],
      num_items: quantity,
    });

    openCheckout();
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
      showToast((err as any)?.message === "SOLD_OUT" ? "Sorry, this piece just sold out." : "Buy Now failed. Please try again.", "error");
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
      showToast((err as any)?.message === "SOLD_OUT" ? "Sorry, this piece just sold out." : "Buy Now failed. Please try again.", "error");
    } finally {
      setIsBuyingNow(false);
    }
  };

  const isOutOfStock = stockNumber < 1;

  const qtyButton =
    "flex h-full w-10 items-center justify-center text-lg text-primary transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-col gap-4">
      {/* Quantity — compact; most orders are a single piece */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">Qty</span>
        <div className="flex h-10 items-center overflow-hidden rounded-lg border border-gray-300">
          <button
            type="button"
            className={qtyButton}
            onClick={() => handleQuantity("d")}
            disabled={quantity === 1 || isOutOfStock}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="w-8 text-center text-sm font-semibold tabular-nums text-primary">
            {quantity}
          </span>
          <button
            type="button"
            className={qtyButton}
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
        ) : stockNumber < 10 && !lowStockShownAbove ? (
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

      {/* Action Buttons — Buy Now is the primary action */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={isAdding || isOutOfStock}
          className={`flex min-h-[52px] items-center justify-center gap-2 rounded-lg border-2 px-3 text-sm font-semibold uppercase tracking-wide transition-colors duration-200 ${isAdded
              ? "border-green-600 bg-green-600 text-white"
              : isOutOfStock
                ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                : "border-primary bg-white text-primary hover:bg-primary hover:text-white"
            }`}
        >
          {isAdding ? (
            <>
              <Spinner />
              Adding...
            </>
          ) : isAdded ? (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Added!
            </>
          ) : isOutOfStock ? (
            "Out of Stock"
          ) : (
            "Add to Cart"
          )}
        </button>

        <button
          type="button"
          onClick={handleBuyNow}
          disabled={isOutOfStock || isBuyingNow}
          className={`flex min-h-[52px] items-center justify-center gap-2 rounded-lg border-2 px-3 text-sm font-semibold uppercase tracking-wide transition-colors duration-200 ${isOutOfStock
              ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
              : "border-accent bg-accent text-white shadow-md hover:border-accent/90 hover:bg-accent/90"
            }`}
        >
          {isBuyingNow ? (
            <>
              <Spinner />
              Redirecting...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Buy Now
            </>
          )}
        </button>
      </div>

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
