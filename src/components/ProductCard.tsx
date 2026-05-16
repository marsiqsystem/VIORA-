"use client";

import { products } from "@wix/stores";
import DOMPurify from "isomorphic-dompurify";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { memo, useState } from "react";
import nextDynamic from "next/dynamic";
import { trackAddToWishlist } from "@/lib/metaPixel";
import { useWixClient } from "@/hooks/useWixClient";

// Modal JS is only needed when a logged-out user taps the heart — defer it.
const LoginModal = nextDynamic(() => import("./LoginModal"), { ssr: false });

const ProductCard = ({
  product,
  index,
}: {
  product: products.Product;
  index: number;
}) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const wixClient = useWixClient();

  const wishlistItem = () => {
    setIsWishlisted((prev) => {
      const next = !prev;
      if (next && product._id) {
        trackAddToWishlist(
          [product._id],
          product.name || undefined,
          product.price?.discountedPrice || product.price?.price || 0,
          "INR"
        );
      }
      return next;
    });
  };

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!wixClient.auth.loggedIn()) {
      setShowLoginModal(true);
      return;
    }
    wishlistItem();
  };

  const hasDiscount = product.price?.price !== product.price?.discountedPrice;
  const discount = hasDiscount
    ? Math.round(
        (((product.price?.price || 0) - (product.price?.discountedPrice || 0)) /
          (product.price?.price || 1)) *
          100
      )
    : 0;
  const isLowStock = product.stock?.quantity && product.stock.quantity < 5;
  const href = "/" + product.slug;

  // Strip color suffix: "Base Name - Color" → "Base Name"
  const displayName = (product.name || "").split(" - ")[0].trim();

  const handleNavigate = () => {
    setIsLoading(true);
    router.push(href);
  };

  return (
    <div
      className="product-card group"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={handleNavigate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleNavigate();
          }
        }}
        className="block w-full cursor-pointer text-left"
      >
        <div className="product-card-image">
          <Image
            src={product.media?.mainMedia?.image?.url || "/product.png"}
            alt={product.name || "product"}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 will-change-transform group-hover:scale-[1.03]"
          />

          {product.media?.items && product.media.items[1] && (
            <Image
              src={product.media.items[1].image?.url || "/product.png"}
              alt={product.name || "product"}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              className="object-cover absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 will-change-[opacity]"
            />
          )}

          <div className="absolute top-3 left-3 flex flex-col gap-2">
            {hasDiscount && (
              <span className="badge badge-sale">-{discount}%</span>
            )}
          </div>

          <button
            type="button"
            onClick={handleWishlistToggle}
            aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
            aria-pressed={isWishlisted}
            title={isWishlisted ? "Saved to wishlist" : "Add to wishlist"}
            className="absolute top-3 right-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md hover:bg-white transition-transform duration-200 active:scale-90"
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


        </div>
      </div>

      <div className="p-3 md:p-4">
        <button
          type="button"
          onClick={handleNavigate}
          className="text-left"
        >
          <h3 className="font-medium text-xs md:text-base text-gray-800 hover:text-accent transition-colors line-clamp-1">
            {displayName}
          </h3>
        </button>

        {product.additionalInfoSections && (
          <p
            className="text-xs text-gray-500 mt-1 line-clamp-1 hidden md:block"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(
                product.additionalInfoSections.find(
                  (section: any) => section.title === "shortDesc"
                )?.description || ""
              ),
            }}
          />
        )}

        <div className="flex items-center gap-2 mt-2">
          <span className="font-bold text-sm md:text-lg text-accent">
            Rs. {product.price?.discountedPrice}
          </span>
          {hasDiscount && (
            <span className="text-xs md:text-sm text-gray-400 line-through">
              Rs. {product.price?.price}
            </span>
          )}
        </div>

        <p className="mt-1 flex items-center gap-1 text-xs sm:text-sm font-medium text-green-700">
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h11v10H3z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4l3 3v4h-7" />
          </svg>
          Free Delivery
        </p>

        {isLowStock && (
          <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></span>
            Only {product.stock?.quantity} left
          </p>
        )}

        <button
          type="button"
          onClick={handleNavigate}
          className="mt-3 w-full py-2 md:py-2.5 text-xs md:text-sm font-medium text-center border border-accent text-accent rounded-full hover:bg-accent hover:text-white transition-all duration-300 block min-h-[44px]"
        >
          View Product
        </button>
      </div>

      <LoginModal
        open={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLoggedIn={wishlistItem}
      />
    </div>
  );
};

export default memo(ProductCard);
