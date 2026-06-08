"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";
import { useToast } from "@/components/Toast";
import { trackMetaEvent } from "@/lib/metaEvents";
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
type Props = {
  productId: string;
  variantId: string;
  productName: string;
  productPrice: number;
  productImage?: string;
  isOutOfStock: boolean;
  hasUnselectedVariants: boolean;
  triggerSelector: string;
  selectedOptions?: Record<string, string>;
};

const StickyAddToCart = ({
  productId,
  variantId,
  productName,
  productPrice,
  productImage,
  isOutOfStock,
  hasUnselectedVariants,
  triggerSelector,
  selectedOptions,
}: Props) => {
  const wixClient = useWixClient();
  const router = useRouter();
  const { addItem, cart, getCart } = useCartStore();
  const { showToast } = useToast();
  const [visible, setVisible] = useState(false);
  const [isBuyingNow, setIsBuyingNow] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [abandonedItems, setAbandonedItems] = useState<AbandonedCartItem[]>([]);

  useEffect(() => {
    const target = document.querySelector(triggerSelector);
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [triggerSelector]);

  const baseEvent = {
    currency: "INR",
    value: productPrice,
    content_ids: [productId],
    content_name: productName,
    content_type: "product",
    contents: [{ id: productId, quantity: 1, item_price: productPrice }],
    num_items: 1,
  };

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

  const runBuyNow = async () => {
    trackMetaEvent("AddToCart", baseEvent);

    await addItem(wixClient, productId, variantId, 1, selectedOptions);

    const verifyCart = await wixClient.currentCart.getCurrentCart();
    if (!verifyCart?.lineItems?.length) {
      throw new Error("Cart is still empty after adding item");
    }

    trackMetaEvent("InitiateCheckout", baseEvent);
    setCheckoutOpen(true);
  };

  const handleBuyNow = async () => {
    if (isOutOfStock || isBuyingNow) return;

    if (hasUnselectedVariants) {
      document
        .querySelector(triggerSelector)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const other = collectAbandonedItems();
    if (other.length > 0) {
      setAbandonedItems(other);
      setConfirmOpen(true);
      return;
    }

    setIsBuyingNow(true);
    try {
      await runBuyNow();
    } catch (err: any) {
      console.error("Sticky Buy Now failed:", err);
      const cause =
        err?.details?.applicationError?.description ||
        err?.message ||
        "Please try again.";
      showToast(`Buy Now failed: ${cause}`, "error");
    } finally {
      setIsBuyingNow(false);
    }
  };

  const handleConfirmDecision = async (decision: "yes" | "no") => {
    setIsBuyingNow(true);
    try {
      if (decision === "no") {
        const ids = abandonedItems.map((i) => i.id).filter(Boolean);
        if (ids.length) {
          await wixClient.currentCart.removeLineItemsFromCurrentCart(ids);
          await getCart(wixClient);
        }
      }
      await runBuyNow();
      setConfirmOpen(false);
    } catch (err: any) {
      console.error("Sticky Buy Now confirmation failed:", err);
      const cause =
        err?.details?.applicationError?.description ||
        err?.message ||
        "Please try again.";
      showToast(`Buy Now failed: ${cause}`, "error");
    } finally {
      setIsBuyingNow(false);
    }
  };

  return (
    <div
      aria-hidden={!visible}
      className={`lg:hidden fixed inset-x-0 bottom-16 z-40 transition-transform duration-300 ease-out ${
        visible ? "translate-y-0" : "translate-y-[150%] pointer-events-none"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-3 mb-3 rounded-2xl border border-white/10 bg-[#1A1410] shadow-[0_-8px_30px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3 p-3">
          <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-white/5">
            {productImage ? (
              <Image
                src={productImage}
                alt={productName}
                fill
                sizes="56px"
                className="object-cover"
              />
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-white/90 font-playfair">
              {productName}
            </p>
            <p className="text-base font-semibold text-white">
              ₹{productPrice}
            </p>
          </div>

          <button
            onClick={handleBuyNow}
            disabled={isOutOfStock || isBuyingNow}
            className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold uppercase tracking-wider text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: "#9B1B30" }}
          >
            {isBuyingNow ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : isOutOfStock ? (
              "Sold Out"
            ) : hasUnselectedVariants ? (
              "Select Options"
            ) : (
              "Buy Now"
            )}
          </button>
        </div>
      </div>

      <CheckoutModal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} />

      <BuyNowConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        abandonedItems={abandonedItems}
        currentProductPrice={productPrice}
        onDecision={handleConfirmDecision}
      />
    </div>
  );
};

export default StickyAddToCart;
