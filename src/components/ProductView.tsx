"use client";

import { products } from "@wix/stores";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import dynamic from "next/dynamic";
import { trackMetaEvent } from "@/lib/metaEvents";
import { rememberMetaCatalogId } from "@/lib/metaCatalogId";
import { htmlToText } from "@/lib/htmlToText";
import {
    COD_CHARGE,
    PREPAID_DISCOUNT,
} from "@/lib/checkoutPricing";
import { whatsappLink } from "@/lib/contact";
import { DISPATCH_CUTOFF_LABEL } from "@/lib/deliveryEstimate";
import { useSocialProof } from "@/hooks/useSocialProof";
import type { ReviewSnippet } from "@/lib/reviewSnippets";
import ProductImages from "./ProductImages";
import CustomizeProducts from "./CustomizeProducts";
import Add from "./Add";
import ColorVariantSwatches, { ColorSibling } from "./ColorVariantSwatches";
import PairItWith from "./PairItWith";
import ProductOffers from "./ProductOffers";
import DeliveryTimeline from "./product/DeliveryTimeline";
import PaymentMethods from "./product/PaymentMethods";
import ReviewSnippets from "./product/ReviewSnippets";
import type { PairItem } from "./PairItWith";
import type { ProductReel } from "./ProductReels";
import { useProductFloatingReel } from "./FloatingReel";
import type { PublicReview } from "@/lib/reviewsTypes";

// Below-the-fold / non-critical: defer JS so initial product page is faster.
const ReviewsSection = dynamic(() => import("./ReviewsSection"), {
  ssr: false,
  loading: () => (
    <div className="h-48 w-full animate-pulse rounded-lg bg-gray-100" />
  ),
});
const StickyAddToCart = dynamic(() => import("./StickyAddToCart"), {
  ssr: false,
});
const ProductReels = dynamic(() => import("./ProductReels"), { ssr: false });

const STICKY_TRIGGER_ID = "product-actions-anchor";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.viorajewel.in").replace(/\/$/, "");

// Same material facts as the FAQ and Material & Care below.
const BENEFITS = [
    "Rhodium-plated brass with a bright, lasting shine",
    "Original stones that catch the light",
    "Skin-friendly for everyday wear",
];

// Wix stock at or below this shows "Only N left" above the colours.
const LOW_STOCK_MAX = 5;

const ICON = {
    truck: "M3 7h11v10H3zM14 10h4l3 3v4h-7M7.5 19.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.5 19.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
    cash: "M3 6h18v12H3zM12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM6 12h.01M18 12h.01",
    exchange: "M3 12a9 9 0 019-9 9 9 0 018 5M21 12a9 9 0 01-9 9 9 9 0 01-8-5M3 4v4h4M21 20v-4h-4",
    shield: "M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9.5 12l1.8 1.8L15 10",
    check: "M20 6L9 17l-5-5",
    lock: "M5 11h14v10H5zM8 11V7a4 4 0 018 0v4",
    share: "M4 12v8h16v-8M12 3v13M7 8l5-5 5 5",
    sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z",
};

const TRUST_ITEMS = [
    { label: "Free delivery", sub: "When you pay online", d: ICON.truck },
    { label: "Cash on delivery", sub: `Available, ₹${COD_CHARGE} extra`, d: ICON.cash },
    { label: "48-hour exchange", sub: "If damaged or wrong", d: ICON.exchange },
    { label: "Secure checkout", sub: "UPI & cards by Razorpay", d: ICON.shield },
];

// Shown only for products without their own "Care Instructions" section in
// Wix. Same material/care facts as the FAQ (src/components/FaqSection.tsx).
const MATERIAL_AND_CARE = [
    "Premium brass with rhodium plating for a bright, lasting finish, set with original glass stones",
    "Skin-friendly for everyday wear — if you have known metal sensitivities, patch test first",
    "Wipe with a soft, dry cloth after each use",
    "Keep away from water, perfume, sweat and harsh chemicals",
    "Store in a dry, airtight pouch or box — with care, the polish lasts 1.5–2 years",
];

const STAR_PATH =
    "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";

// Wix rich text has no typography plugin to lean on, so style its tags directly.
const RICH_TEXT =
    "text-sm leading-relaxed text-gray-600 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:text-primary [&_ul]:list-disc [&_ul]:pl-5";

const Icon = ({ d, className = "h-5 w-5" }: { d: string; className?: string }) => (
    <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d={d} />
    </svg>
);

// Native share sheet on phones (WhatsApp, Instagram…); WhatsApp link elsewhere.
const ShareButton = ({ name, slug }: { name: string; slug: string }) => {
    const share = async () => {
        const url = `${SITE_URL}/${slug}`;
        const text = `Look at this ${name} from Viora Jewel — what do you think?`;
        if (typeof navigator !== "undefined" && navigator.share) {
            try {
                await navigator.share({ title: name, text, url });
            } catch {
                // Shopper closed the share sheet — nothing to do.
            }
            return;
        }
        window.open(
            `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
            "_blank",
            "noopener,noreferrer"
        );
    };

    return (
        <button
            type="button"
            onClick={share}
            className="flex items-center gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5 text-left transition-colors hover:border-primary"
        >
            <Icon d={ICON.share} className="h-5 w-5 flex-shrink-0 text-primary" />
            <span className="text-xs leading-tight">
                <span className="block font-semibold text-primary">Ask a friend</span>
                <span className="text-gray-500">Share for a second opinion</span>
            </span>
        </button>
    );
};

const Accordion = ({
    title,
    defaultOpen = false,
    detailsRef,
    children,
}: {
    title: string;
    defaultOpen?: boolean;
    detailsRef?: RefObject<HTMLDetailsElement>;
    children: ReactNode;
}) => (
    <details
        ref={detailsRef}
        open={defaultOpen}
        className="group scroll-mt-24 border-b border-gray-200"
    >
        <summary className="flex cursor-pointer list-none items-center justify-between py-4 [&::-webkit-details-marker]:hidden">
            <h3 className="font-inter text-sm font-semibold uppercase tracking-wider text-primary">
                {title}
            </h3>
            <svg
                className="h-5 w-5 text-gray-400 transition-transform group-open:rotate-180"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        </summary>
        <div className="pb-5">{children}</div>
    </details>
);

interface ProductViewProps {
    product: products.Product;
    colorSiblings?: ColorSibling[];
    currentColor?: string;
    displayName?: string;
    isBestSeller?: boolean;
    initialReviews?: PublicReview[];
    pairWith?: PairItem[];
    reels?: ProductReel[];
    /** Occasion labels from the product's Wix collections, e.g. "Weddings & receptions". */
    occasions?: string[];
    /** Earrings vs sets — decides the festive-combo copy. */
    /** Real 4★+ review quotes (this design first) for the top of the page. */
    reviewSnippets?: ReviewSnippet[];
}

const ProductView = ({ product, colorSiblings = [], currentColor = "", displayName, isBestSeller = false, initialReviews = [], pairWith = [], reels = [], occasions = [], reviewSnippets = [] }: ProductViewProps) => {
    const [selectedOptions, setSelectedOptions] = useState<{
        [key: string]: string;
    }>({});
    const descriptionRef = useRef<HTMLDetailsElement>(null);
    // Real orders this week — the API only returns counts of 3 or more.
    const weekOrders = useSocialProof().byProduct[product._id || ""] || 0;

    // Descriptive image alt text. Product photos previously all carried alt="product",
    // which tells Google Images nothing and fails screen readers.
    const baseName = displayName || (product.name || "").split(" - ")[0].trim();
    const altName = [baseName, currentColor && `in ${currentColor}`]
        .filter(Boolean)
        .join(" ");
    const slug = product.slug || "";

    // The ID our Meta catalog keys on is the product's URL SLUG, not the Wix
    // GUID. Send the slug on every Meta event so events match a catalog product
    // (fall back to the GUID only if a slug is somehow missing).
    const metaContentId = product.slug || product._id || "";

    // Fire ViewContent (Pixel + CAPI) once per product load
    useEffect(() => {
        if (!product?._id) return;
        // Remember GUID→slug so the cart/success pages (which only see the GUID
        // on cart line items) can send the catalog-matching slug too.
        rememberMetaCatalogId(product._id, product.slug);
        trackMetaEvent("ViewContent", {
            currency: "INR",
            value:
                product.price?.discountedPrice ||
                product.price?.price ||
                0,
            content_ids: [metaContentId],
            content_name: product.name || undefined,
            content_type: "product",
        });
    }, [product?._id, product?.slug, metaContentId, product?.name, product?.price?.discountedPrice, product?.price?.price]);

    // Photos only — product videos are shown in the reels row instead.
    const allMediaItems = useMemo(
        () => (product.media?.items || []).filter((item) => !!item.image?.url),
        [product.media?.items]
    );

    // Filter media items based on selected options
    const filteredMediaItems = useMemo(() => {
        if (!product.productOptions || Object.keys(selectedOptions).length === 0) {
            return allMediaItems;
        }

        // Find linked media for selected options
        let linkedMediaIds: string[] = [];

        for (const option of product.productOptions) {
            const selectedValue = selectedOptions[option.name!];
            if (!selectedValue) continue;

            // Find the selected choice
            const selectedChoice = option.choices?.find(
                (choice) => choice.description === selectedValue
            );

            // Check if this choice has linked media
            if (selectedChoice?.media?.items && selectedChoice.media.items.length > 0) {
                // Get the media IDs from the choice
                const choiceMediaIds = selectedChoice.media.items
                    .map((item: any) => item._id)
                    .filter(Boolean);

                if (choiceMediaIds.length > 0) {
                    linkedMediaIds = [...linkedMediaIds, ...choiceMediaIds];
                }
            }
        }

        // If we found linked media, filter to only show those
        if (linkedMediaIds.length > 0) {
            const filtered = allMediaItems.filter((item: any) =>
                linkedMediaIds.includes(item._id)
            );
            // Return filtered if we found matches, otherwise return all
            return filtered.length > 0 ? filtered : allMediaItems;
        }

        return allMediaItems;
    }, [selectedOptions, product.productOptions, allMediaItems]);

    // Handle option selection changes from CustomizeProducts
    const handleOptionChange = (options: { [key: string]: string }) => {
        setSelectedOptions(options);
    };

    const actualPrice = product.price?.price || 0;
    const discountedPrice = product.price?.discountedPrice || null;
    const hasDiscount = !!discountedPrice && discountedPrice < actualPrice;
    const currentSellingPrice = hasDiscount ? discountedPrice : actualPrice;
    const discountPercent = hasDiscount
        ? Math.round(((actualPrice - currentSellingPrice) / actualPrice) * 100)
        : 0;
    const mrpSaving = hasDiscount ? actualPrice - currentSellingPrice : 0;

    // Prepaid vs COD, from the same constants the checkout charges with.
    const prepaidPrice = Math.max(0, currentSellingPrice - PREPAID_DISCOUNT);

    // The site-wide floating reel shows only this product's videos here (none → hidden).
    useProductFloatingReel(
        reels.length
            ? {
                  items: reels.map((r) => ({ ...r, productName: baseName, price: currentSellingPrice, prepaidPrice })),
                  shopTargetSelector: `#${STICKY_TRIGGER_ID}`,
              }
            : null
    );

    // Real rating + count derived from initialReviews (Wix Reviews).
    const realReviewCount = initialReviews.length;
    const realAvgRating =
        realReviewCount > 0
            ? initialReviews.reduce((s, r) => s + (r.rating || 0), 0) / realReviewCount
            : 0;
    const hasRealReviews = realReviewCount > 0;
    const filledStars = hasRealReviews ? Math.round(realAvgRating) : 0;

    const descriptionText = useMemo(
        () => htmlToText(product.description || ""),
        [product.description]
    );

    // Wix "additional info" sections (Set Includes, Key Features, Care
    // Instructions, Style Tip, Occasion…). "shortDesc" is card copy, not a section.
    const infoSections = (product.additionalInfoSections || []).filter(
        (s) => s.title && s.description && s.title !== "shortDesc"
    );
    const hasCareSection = infoSections.some((s) => /care/i.test(s.title || ""));

    const openDescription = () => {
        const el = descriptionRef.current;
        if (!el) return;
        el.open = true;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    // Real Wix stock: the selected option's variant when the piece has options
    // (same rule as CustomizeProducts), otherwise the product's tracked quantity.
    const hasOptions = !!(product.variants && product.productOptions);
    const onlyDefaultVariant =
        product.variants?.length === 1 && Object.keys(product.variants[0].choices || {}).length === 0
            ? product.variants[0]
            : undefined;
    const selectedVariant = hasOptions
        ? product.variants!.find(
              (v) =>
                  !!v.choices &&
                  Object.entries(selectedOptions).every(([k, val]) => v.choices![k] === val)
          ) || onlyDefaultVariant
        : undefined;
    const stockQuantity = hasOptions
        ? selectedVariant?.stock?.quantity
        : product.stock?.trackInventory === true
          ? product.stock?.quantity
          : undefined;
    const lowStockLeft =
        typeof stockQuantity === "number" && stockQuantity > 0 && stockQuantity <= LOW_STOCK_MAX
            ? stockQuantity
            : 0;

    const stockOut =
        // Only flag as sold out when Wix explicitly says inStock: false
        // OR when inventory IS tracked and quantity has reached 0.
        // Products that don't track inventory have undefined quantity —
        // the old `(quantity || 0) < 1` was wrongly marking those as
        // sold out, which is why every product showed "SOLD OUT".
        product.stock?.inStock === false ||
        (product.stock?.trackInventory === true &&
            (product.stock?.quantity ?? 0) < 1);

    return (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
            {/* Images — pins to viewport while right column (details/reviews) scrolls.
                `lg:self-start lg:h-fit` keeps the column from stretching to the full
                grid height (which is what previously broke the sticky lock and left
                blank space below the image on long pages). */}
            {/*
              Full-bleed mobile: w-screen + relative left-1/2 -translate-x-1/2 escapes
              the parent's px-4 and locks the gallery to exactly the viewport width.
              overflow-hidden contains the swipe gesture so no horizontal page scroll
              appears as a "white gap" on the right. md+ restores in-flow behaviour.
            */}
            <div className="relative left-1/2 -translate-x-1/2 w-screen max-w-[100vw] overflow-hidden md:left-auto md:translate-x-0 md:w-full md:max-w-none md:overflow-visible lg:w-[55%] lg:flex-shrink-0 lg:sticky lg:top-32 lg:self-start lg:h-fit">
                <ProductImages
                    items={filteredMediaItems}
                    isBestSeller={isBestSeller}
                    ribbon={product.ribbon || ""}
                    discountPercent={discountPercent}
                    reelCount={reels.length}
                    productName={altName}
                />
            </div>

            {/* Details — ordered for buying: what it is → price → prepaid offer →
                colour → buy → delivery/trust → share → videos →
                add to your order → details → reviews. */}
            <div className="flex w-full min-w-0 flex-col gap-6 lg:flex-1">
                {/* Name, stars, chips, summary */}
                <div>
                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-playfair font-bold text-primary leading-tight">
                        {baseName}
                    </h1>

                    <a
                        href="#reviews"
                        className="mt-1.5 inline-flex items-center gap-2 text-sm"
                        aria-label={
                            hasRealReviews
                                ? `Rated ${realAvgRating.toFixed(1)} out of 5 from ${realReviewCount} ${realReviewCount === 1 ? "review" : "reviews"}`
                                : "No reviews yet — be the first to review"
                        }
                    >
                        <span className="flex items-center gap-0.5" aria-hidden="true">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <svg
                                    key={star}
                                    className={`h-[18px] w-[18px] ${star <= filledStars ? "text-amber-400" : "text-gray-300"}`}
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    <path d={STAR_PATH} />
                                </svg>
                            ))}
                        </span>
                        {hasRealReviews ? (
                            <span aria-hidden="true">
                                <span className="font-semibold text-gray-800">{realAvgRating.toFixed(1)}</span>
                                <span className="ml-1 text-gray-500">
                                    ({realReviewCount} {realReviewCount === 1 ? "review" : "reviews"})
                                </span>
                            </span>
                        ) : (
                            <span aria-hidden="true" className="text-gray-500 underline-offset-2 hover:underline">
                                {reviewSnippets.length > 0 ? "Be the first to review this colour" : "Be the first to review"}
                            </span>
                        )}
                    </a>

                    {weekOrders > 0 && (
                        <p className="mt-2.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/5 px-3 py-1 text-xs font-semibold text-accent">
                                <Icon d={ICON.check} className="h-3.5 w-3.5" />
                                Ordered {weekOrders} times this week
                            </span>
                        </p>
                    )}

                    <ul className="mt-3 space-y-1.5">
                        {BENEFITS.map((b) => (
                            <li key={b} className="flex items-center gap-2 text-sm text-gray-700">
                                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white">
                                    <Icon d={ICON.check} className="h-2.5 w-2.5" />
                                </span>
                                {b}
                            </li>
                        ))}
                    </ul>

                    {occasions.length > 0 && (
                        <p className="mt-2.5 flex items-center gap-1.5 text-sm text-gray-600">
                            <Icon d={ICON.sparkle} className="h-4 w-4 flex-shrink-0 text-silver-dark" />
                            <span>
                                Perfect for{" "}
                                <span className="font-semibold text-primary">{occasions.join(" · ")}</span>
                            </span>
                        </p>
                    )}

                    {descriptionText && (
                        <div className="mt-3 text-sm leading-relaxed text-gray-600">
                            <p className="line-clamp-2">{descriptionText}</p>
                            <button
                                type="button"
                                onClick={openDescription}
                                className="mt-1 font-semibold text-accent underline-offset-2 hover:underline"
                            >
                                Read more
                            </button>
                        </div>
                    )}
                </div>

                {/* Price */}
                <div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-3xl md:text-4xl font-bold text-primary">
                            ₹{currentSellingPrice}
                        </span>
                        {hasDiscount && (
                            <>
                                <span className="text-lg text-gray-400 line-through">
                                    ₹{actualPrice}
                                </span>
                                <span className="rounded-md bg-accent px-2.5 py-1 text-sm font-bold text-white">
                                    {discountPercent}% OFF
                                </span>
                            </>
                        )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                        Inclusive of all taxes
                        {mrpSaving > 0 && (
                            <>
                                {" · "}
                                <span className="font-semibold text-green-700">You save ₹{mrpSaving}</span>
                            </>
                        )}
                    </p>
                </div>

                <ReviewSnippets snippets={reviewSnippets} />

                {/* Pay-online deal, spend-more cards, festive combo */}
                <ProductOffers price={currentSellingPrice} productId={product._id!} />

                {lowStockLeft > 0 && (
                    <p className="-mb-3 flex items-center gap-2 text-sm font-semibold text-red-700">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" aria-hidden="true" />
                        Only {lowStockLeft} left in stock
                    </p>
                )}

                {/* Color siblings (Wix 15-image bypass — grouped by Base Name) */}
                {colorSiblings.length > 1 && (
                    <ColorVariantSwatches
                        currentId={product._id!}
                        currentColor={currentColor}
                        siblings={colorSiblings}
                    />
                )}

                {/* Options & buy buttons */}
                <div id={STICKY_TRIGGER_ID}>
                    {product.variants && product.productOptions ? (
                        <CustomizeProducts
                            productId={product._id!}
                            contentId={metaContentId}
                            productName={product.name || "Unnamed Product"}
                            basePrice={
                                product.price?.discountedPrice || product.price?.price || 0
                            }
                            variants={product.variants || []}
                            productOptions={product.productOptions || []}
                            onOptionChange={handleOptionChange}
                            lowStockShownAbove={lowStockLeft > 0}
                        />
                    ) : (
                        <Add
                            productId={product._id!}
                            contentId={metaContentId}
                            variantId="00000000-0000-0000-0000-000000000000"
                            stockNumber={
                                // When inventory isn't tracked, treat stock as essentially unlimited
                                // so the quantity selector works. Cap at tracked quantity otherwise.
                                product.stock?.trackInventory === true
                                    ? product.stock?.quantity || 0
                                    : 99
                            }
                            productName={product.name || "Unnamed Product"}
                            productPrice={
                                product.price?.discountedPrice || product.price?.price || 0
                            }
                            lowStockShownAbove={lowStockLeft > 0}
                        />
                    )}
                    <PaymentMethods className="mt-4" />
                </div>

                {/* Trust tiles, delivery timeline with the real dispatch cutoff, WhatsApp help */}
                <div>
                    <ul className="grid grid-cols-2 gap-2">
                        {TRUST_ITEMS.map((x) => (
                            <li key={x.label} className="flex items-center gap-2.5 bg-platinum px-3 py-3">
                                <Icon d={x.d} className="h-6 w-6 flex-shrink-0 text-primary" />
                                <span className="min-w-0 leading-tight">
                                    <span className="block text-[13px] font-semibold text-primary">{x.label}</span>
                                    <span className="block text-[11px] text-gray-500">{x.sub}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                    <div className="mt-4 rounded-lg border border-gray-200 p-4">
                        <DeliveryTimeline />
                        <a
                            href={whatsappLink(
                                `Hi Viora! I'd like to know more about the ${baseName}: ${SITE_URL}/${slug}`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 flex items-center justify-center gap-2 border-t border-gray-100 pt-3 text-sm font-medium text-green-700 hover:underline"
                        >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.04 21.5h-.01a9.5 9.5 0 01-4.84-1.33l-.35-.2-3.6.94.96-3.5-.23-.36a9.46 9.46 0 01-1.45-5.05c0-5.24 4.27-9.5 9.52-9.5a9.46 9.46 0 019.5 9.51c0 5.24-4.27 9.5-9.5 9.5zm8.08-17.58A11.35 11.35 0 0012.04.5C5.74.5.62 5.62.61 11.92c0 2.01.53 3.98 1.53 5.71L.5 23.5l6.02-1.58a11.4 11.4 0 005.51 1.4h.01c6.3 0 11.42-5.12 11.43-11.42a11.35 11.35 0 00-3.35-8.08z" />
                            </svg>
                            Want a closer look? Chat with us on WhatsApp
                        </a>
                    </div>
                </div>

                <ProductReels
                    reels={reels}
                    productName={baseName}
                    price={currentSellingPrice}
                    prepaidPrice={prepaidPrice}
                    shopTargetSelector={`#${STICKY_TRIGGER_ID}`}
                />

                <ShareButton name={baseName} slug={slug} />

                <PairItWith
                    items={pairWith}
                    current={{
                        id: product._id!,
                        slug: metaContentId,
                        name: product.name || "",
                        price: currentSellingPrice,
                        variantId: selectedVariant?._id || undefined,
                        options: Object.keys(selectedOptions).length ? selectedOptions : undefined,
                        canAdd:
                            !stockOut &&
                            !(hasOptions && Object.keys(selectedOptions).length < (product.productOptions?.length || 0)),
                    }}
                />

                {/* Details */}
                <div className="border-t border-gray-200">
                    {product.description && (
                        <Accordion title="Description" detailsRef={descriptionRef}>
                            <div
                                className={RICH_TEXT}
                                dangerouslySetInnerHTML={{ __html: product.description }}
                            />
                        </Accordion>
                    )}

                    {infoSections.map((section, i) => (
                        <Accordion key={section.title} title={section.title!} defaultOpen={i === 0}>
                            <div
                                className={RICH_TEXT}
                                dangerouslySetInnerHTML={{ __html: section.description || "" }}
                            />
                        </Accordion>
                    ))}

                    {!hasCareSection && (
                        <Accordion title="Material & Care">
                            <ul className="space-y-2">
                                {MATERIAL_AND_CARE.map((point) => (
                                    <li key={point} className="flex items-start gap-2.5 text-sm text-gray-600">
                                        <Icon d={ICON.check} className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                                        <span>{point}</span>
                                    </li>
                                ))}
                            </ul>
                        </Accordion>
                    )}

                    <Accordion title="Shipping & Exchange">
                        <ul className="space-y-2 text-sm text-gray-600">
                            <li>
                                <strong className="text-primary">Free delivery</strong> on prepaid
                                orders. Cash on Delivery available with a ₹{COD_CHARGE} charge.
                            </li>
                            <li>
                                Orders placed before {DISPATCH_CUTOFF_LABEL} ship the same day (Monday to
                                Saturday), then usually arrive in 5–7 business days, anywhere in India.
                            </li>
                            <li>
                                <strong className="text-primary">48-hour exchange</strong> for damaged
                                or incorrect items.
                            </li>
                            <li className="pt-1">
                                <a href="/shipping-policy" className="text-accent underline-offset-2 hover:underline">
                                    Shipping policy
                                </a>
                                <span className="mx-2 text-gray-300">·</span>
                                <a href="/exchange-policy" className="text-accent underline-offset-2 hover:underline">
                                    Exchange policy
                                </a>
                            </li>
                        </ul>
                    </Accordion>
                </div>

                <ReviewsSection
                    productId={product._id || undefined}
                    productName={product.name || undefined}
                    reviews={initialReviews}
                />
            </div>

            <StickyAddToCart
                productId={product._id!}
                contentId={metaContentId}
                variantId="00000000-0000-0000-0000-000000000000"
                productName={product.name || "Unnamed Product"}
                productPrice={
                    product.price?.discountedPrice || product.price?.price || 0
                }
                compareAtPrice={hasDiscount ? actualPrice : undefined}
                prepaidPrice={prepaidPrice}
                productImage={product.media?.mainMedia?.image?.url}
                isOutOfStock={stockOut}
                hasUnselectedVariants={
                    hasOptions &&
                    Object.keys(selectedOptions).length <
                        (product.productOptions?.length || 0)
                }
                selectedOptions={selectedOptions}
                triggerSelector={`#${STICKY_TRIGGER_ID}`}
            />
        </div>
    );
};

export default ProductView;
