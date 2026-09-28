"use client";

import { products } from "@wix/stores";
import Image from "next/image";
import Link from "next/link";
import { memo, useState } from "react";
import { trackAddToWishlist } from "@/lib/metaPixel";
import { trackMetaEvent } from "@/lib/metaEvents";
import { rememberMetaCatalogId } from "@/lib/metaCatalogId";
import { PREPAID_DISCOUNT } from "@/lib/checkoutPricing";
import { useWixClient } from "@/hooks/useWixClient";
import { useWishlistStore } from "@/hooks/useWishlistStore";
import { useCartStore } from "@/hooks/useCartStore";
import { useCommerceUi } from "@/hooks/useCommerceUi";
import { useSocialProof } from "@/hooks/useSocialProof";
import { PRODUCT_PROOF_MIN } from "@/lib/socialProof";
import { useToast } from "@/components/Toast";

const NO_VARIANT = "00000000-0000-0000-0000-000000000000";

const ProductCard = ({
  product,
  index,
}: {
  product: products.Product;
  index: number;
}) => {
  const [adding, setAdding] = useState(false);
  const wixClient = useWixClient();
  const { addItem, cart } = useCartStore();
  const openDrawer = useCommerceUi((s) => s.openDrawer);
  const { byProduct } = useSocialProof();
  const { showToast } = useToast();

  const isWishlisted = useWishlistStore((s) =>
    product._id ? s.isWishlisted(product._id) : false
  );
  const toggleInStore = useWishlistStore((s) => s.toggle);

  const wishlistItem = () => {
    if (!product._id) return;
    const price =
      product.price?.discountedPrice || product.price?.price || 0;
    const fullPrice = product.price?.price || price;
    const added = toggleInStore({
      id: product._id,
      slug: product.slug || product._id,
      name: product.name || "Unnamed Product",
      image: product.media?.mainMedia?.image?.url || "/product.png",
      price,
      fullPrice,
    });
    if (added) {
      trackAddToWishlist([product._id], product.name || undefined, price, "INR");
    }
  };

  // The wishlist lives in this browser, so saving never needs a login.
  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    wishlistItem();
  };

  const actualPrice = product.price?.price || 0;
  const discountedPrice = product.price?.discountedPrice || null;
  const hasDiscount = discountedPrice && discountedPrice < actualPrice;
  const currentSellingPrice = hasDiscount ? discountedPrice : actualPrice;

  const stockQuantity = product.stock?.quantity;
  const soldOut = product.stock?.inStock === false || stockQuantity === 0;
  const isLowStock = !soldOut && typeof stockQuantity === "number" && stockQuantity < 5;
  const discountPercent = hasDiscount
    ? Math.round(((actualPrice - currentSellingPrice) / actualPrice) * 100)
    : 0;
  const saveAmount = hasDiscount ? actualPrice - currentSellingPrice : 0;
  const prepaidPrice = Math.max(0, currentSellingPrice - PREPAID_DISCOUNT);
  const weekOrders = product._id ? byProduct[product._id] || 0 : 0;
  // Optional merchandising ribbon set in Wix (e.g. "Bestseller", "New").
  const ribbon = (product.ribbon || "").trim();
  const href = "/" + product.slug;

  // Strip color suffix: "Base Name - Color" → "Base Name"
  const displayName = (product.name || "").split(" - ")[0].trim();

  // One tap to the bag when there's nothing to choose (at most one choice per option).
  const options = product.productOptions || [];
  const canQuickAdd = !soldOut && options.every((o) => (o.choices?.length || 0) <= 1);
  const inBag = (cart.lineItems || []).some(
    (li) => li.catalogReference?.catalogItemId === product._id
  );

  const handleProductLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    window.location.assign(href);
  };

  const handleAdd = async () => {
    if (!product._id || adding) return;
    if (inBag) {
      openDrawer(product._id);
      return;
    }
    setAdding(true);
    const metaId = product.slug || product._id;
    rememberMetaCatalogId(product._id, metaId);
    // Fire before awaiting Wix, same as the product page's Add to Cart.
    trackMetaEvent("AddToCart", {
      currency: "INR",
      value: currentSellingPrice,
      content_ids: [metaId],
      content_name: displayName,
      content_type: "product",
      contents: [{ id: metaId, quantity: 1, item_price: currentSellingPrice }],
      num_items: 1,
    });
    const selected: Record<string, string> = {};
    for (const o of options) {
      const choice = o.choices?.[0]?.description;
      if (o.name && choice) selected[o.name] = choice;
    }
    try {
      await addItem(
        wixClient,
        product._id,
        options.length ? product.variants?.[0]?._id || NO_VARIANT : NO_VARIANT,
        1,
        Object.keys(selected).length ? selected : undefined
      );
      openDrawer(product._id);
    } catch (err) {
      console.error("Quick add to bag failed:", err);
      showToast((err as any)?.message === "SOLD_OUT" ? "Sorry, this piece just sold out." : "Couldn't add to bag. Please try again.", "error");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      className="product-card group relative"
    >
      <Link
        href={href}
        aria-label={displayName}
        onClick={handleProductLinkClick}
        className="block"
      >
        <div className="product-card-image">
          <Image
            src={product.media?.mainMedia?.image?.url || "/product.png"}
            alt={product.name || "product"}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
            quality={70}
            priority={index < 4}
            loading={index < 4 ? undefined : "lazy"}
            className={`object-cover transition-transform duration-300 md:group-hover:scale-[1.02] ${soldOut ? "opacity-60 grayscale-[40%]" : ""}`}
          />
          {soldOut && (
            <span className="absolute inset-x-0 bottom-0 bg-primary/85 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-white">
              Sold out
            </span>
          )}
        </div>
      </Link>

      {/* Merchandising badges — top-left. Ribbon (Wix) sits above the discount
          chip. Kept small and on-brand so cards feel alive, not loud. */}
      {(ribbon || discountPercent > 0) && (
        <div className="pointer-events-none absolute top-3 left-3 z-20 flex flex-col items-start gap-1.5">
          {ribbon && (
            <span className="rounded-full bg-[#9B1B30] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
              {ribbon}
            </span>
          )}
          {discountPercent > 0 && (
            <span className="rounded-full bg-[#1A1410] px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
              {discountPercent}% OFF
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleWishlistToggle}
        aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
        aria-pressed={isWishlisted}
        title={isWishlisted ? "Saved to wishlist" : "Add to wishlist"}
        className="absolute top-3 right-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md hover:bg-white transition-transform duration-200 active:scale-90"
      >
        <svg
          className={`w-5 h-5 transition-colors duration-200 ${
            isWishlisted
              ? "text-[#9B1B30] fill-current"
              : "text-[#1A1410] fill-transparent"
          }`}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
      </button>

      <div className="p-3 md:p-4">
        <Link href={href} onClick={handleProductLinkClick} className="block">
          <h3 className="font-inter font-medium text-xs md:text-base text-gray-800 group-hover:text-accent transition-colors line-clamp-1">
            {displayName}
          </h3>
        </Link>

        {product.additionalInfoSections && (
          <p
            className="text-xs text-gray-500 mt-1 line-clamp-1 hidden md:block"
          >
            {(product.additionalInfoSections.find(
                  (section: any) => section.title === "shortDesc"
                )?.description || "").replace(/<[^>]*>?/gm, "")}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2">
          <span className="font-bold text-sm md:text-lg text-accent">
            ₹{currentSellingPrice}
          </span>
          {hasDiscount && (
            <span className="text-xs md:text-sm text-gray-400 line-through">
              ₹{actualPrice}
            </span>
          )}
          {saveAmount > 0 && (
            <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
              Save ₹{saveAmount}
            </span>
          )}
        </div>

        {!soldOut && (
          <p className="mt-1 text-[11px] font-medium text-green-700 sm:text-xs">
            ₹{prepaidPrice} paying online · free delivery
          </p>
        )}

        {isLowStock ? (
          <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></span>
            Only {stockQuantity} left
          </p>
        ) : weekOrders >= PRODUCT_PROOF_MIN ? (
          <p className="mt-1 text-xs font-medium text-orange-700">🔥 Ordered {weekOrders} times this week</p>
        ) : null}

        {soldOut ? (
          <Link
            href={href}
            onClick={handleProductLinkClick}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center border border-gray-300 text-xs font-medium text-gray-500 md:text-sm"
          >
            View details
          </Link>
        ) : canQuickAdd ? (
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className={`mt-3 flex min-h-[44px] w-full items-center justify-center text-xs font-bold uppercase tracking-wide transition-colors md:text-sm ${
              inBag
                ? "bg-green-600 text-white"
                : "bg-accent text-white hover:bg-[#7d1527] disabled:opacity-60"
            }`}
          >
            {adding ? "Adding…" : inBag ? "✓ In your bag" : "Add to bag"}
          </button>
        ) : (
          <Link
            href={href}
            onClick={handleProductLinkClick}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center border border-accent text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-white md:text-sm"
          >
            Choose options
          </Link>
        )}
      </div>

    </div>
  );
};

export default memo(ProductCard);
