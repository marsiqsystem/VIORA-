"use client";

import { products } from "@wix/stores";
import { useEffect, useState, useMemo } from "react";
import { trackMetaEvent } from "@/lib/metaEvents";
import DOMPurify from "isomorphic-dompurify";
import dynamic from "next/dynamic";
import ProductImages from "./ProductImages";
import CustomizeProducts from "./CustomizeProducts";
import Add from "./Add";
import ColorVariantSwatches, { ColorSibling } from "./ColorVariantSwatches";

// Below-the-fold / non-critical: defer JS so initial product page is faster.
const TrustBadges = dynamic(() => import("./TrustBadges"), { ssr: true });
const ReviewsSection = dynamic(() => import("./ReviewsSection"), {
  ssr: false,
  loading: () => (
    <div className="h-48 w-full animate-pulse rounded-lg bg-gray-100" />
  ),
});
const StickyAddToCart = dynamic(() => import("./StickyAddToCart"), {
  ssr: false,
});

const STICKY_TRIGGER_ID = "product-actions-anchor";

interface ProductViewProps {
    product: products.Product;
    colorSiblings?: ColorSibling[];
    currentColor?: string;
    displayName?: string;
    isBestSeller?: boolean;
}

const ProductView = ({ product, colorSiblings = [], currentColor = "", displayName, isBestSeller = false }: ProductViewProps) => {
    const [selectedOptions, setSelectedOptions] = useState<{
        [key: string]: string;
    }>({});

    // Fire ViewContent (Pixel + CAPI) once per product load
    useEffect(() => {
        if (!product?._id) return;
        trackMetaEvent("ViewContent", {
            currency: "INR",
            value:
                product.price?.discountedPrice ||
                product.price?.price ||
                0,
            content_ids: [product._id],
            content_name: product.name || undefined,
            content_type: "product",
        });
    }, [product?._id, product?.name, product?.price?.discountedPrice, product?.price?.price]);

    // Get all media items from the product
    const allMediaItems = product.media?.items || [];

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

    // Calculate discount
    const hasDiscount = product.price?.price !== product.price?.discountedPrice;
    const discountPercent = hasDiscount
        ? Math.round(
            ((product.price?.price! - product.price?.discountedPrice!) /
                product.price?.price!) *
            100
        )
        : 0;

    return (
        <div className="flex flex-col lg:flex-row lg:items-start gap-8 lg:gap-16">
            {/* Images — pins to viewport while right column (details/reviews) scrolls.
                `lg:self-start lg:h-fit` keeps the column from stretching to the full
                grid height (which is what previously broke the sticky lock and left
                blank space below the image on long pages). */}
            <div className="w-full lg:w-1/2 lg:sticky lg:top-32 lg:self-start lg:h-fit">
                <ProductImages items={filteredMediaItems} isBestSeller={isBestSeller} />
            </div>

            {/* Details */}
            <div className="w-full lg:w-1/2 flex flex-col gap-6">
                {/* Title & Badge */}
                <div>
                    {hasDiscount && (
                        <span className="inline-block bg-primary text-white text-xs font-bold px-3 py-1 rounded-full mb-3">
                            {discountPercent}% OFF
                        </span>
                    )}
                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-playfair font-bold text-primary leading-tight">
                        {displayName || (product.name || "").split(" - ")[0].trim()}
                    </h1>

                    {/* Social Proof Text */}
                    <p className="mt-2 text-sm text-gray-600 font-medium">
                        ⭐ 4.8 | 10k+ Units Sold
                    </p>
                </div>

                {/* Highlight Pills */}
                <div className="flex flex-wrap gap-2">
                    {["Premium Polish", "Hypoallergenic", "Cash on Delivery"].map((pill) => (
                        <span
                            key={pill}
                            className="bg-gray-100 text-gray-800 text-xs px-2.5 py-1 rounded-full border border-gray-200 font-medium"
                        >
                            {pill}
                        </span>
                    ))}
                </div>

                {/* Rating */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <svg
                                key={star}
                                className={`w-5 h-5 ${star <= 4 ? "text-primary" : "text-silver-muted"}`}
                                fill="currentColor"
                                viewBox="0 0 20 20"
                            >
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                        ))}
                    </div>
                    <span className="text-sm text-gray-500">(24 reviews)</span>
                </div>

                {/* Description */}
                <div
                    className="text-gray-600 leading-relaxed prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(product.description || ""),
                    }}
                />

                <div className="h-px bg-gray-100" />

                {/* Price */}
                <div className="flex items-baseline flex-wrap gap-3">
                    <span className="text-3xl md:text-4xl font-bold text-primary">
                        ₹{product.price?.discountedPrice}
                    </span>
                    {hasDiscount && (
                        <>
                            <span className="text-xl text-gray-400 line-through">
                                ₹{product.price?.price}
                            </span>
                            <span className="text-green-700 bg-green-50 font-bold px-2 py-0.5 rounded text-sm">
                                ({discountPercent}% OFF)
                            </span>
                        </>
                    )}
                </div>

                {/* UPI Offer Strip */}
                <div className="bg-green-50 border border-green-200 text-green-800 text-sm p-2.5 rounded flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <span>🎉 Get Extra ₹50 Off on Prepaid Payments</span>
                </div>

                <div className="h-px bg-gray-100" />

                {/* Color siblings (Wix 15-image bypass — grouped by Base Name) */}
                {colorSiblings.length > 1 && (
                    <>
                        <ColorVariantSwatches
                            currentId={product._id!}
                            currentColor={currentColor}
                            siblings={colorSiblings}
                        />
                        <div className="h-px bg-gray-100" />
                    </>
                )}

                {/* Options & Add to Cart */}
                <div id={STICKY_TRIGGER_ID}>
                    {product.variants && product.productOptions ? (
                        <CustomizeProducts
                            productId={product._id!}
                            productName={product.name || "Unnamed Product"}
                            basePrice={
                                product.price?.discountedPrice || product.price?.price || 0
                            }
                            variants={product.variants || []}
                            productOptions={product.productOptions || []}
                            onOptionChange={handleOptionChange}
                        />
                    ) : (
                        <Add
                            productId={product._id!}
                            variantId="00000000-0000-0000-0000-000000000000"
                            stockNumber={product.stock?.quantity || 0}
                            productName={product.name || "Unnamed Product"}
                            productPrice={
                                product.price?.discountedPrice || product.price?.price || 0
                            }
                        />
                    )}
                </div>

                <TrustBadges />

                {/* Native Trust & Delivery Section */}
                <div className="border border-gray-100 rounded-lg p-4 bg-gray-50/50">
                    <div className="flex items-center gap-2 mb-3 text-sm text-gray-700 font-medium">
                        <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h11v10H3zM14 10h4l3 3v4h-7" />
                            <circle cx="7.5" cy="17.5" r="1.5" />
                            <circle cx="17.5" cy="17.5" r="1.5" />
                        </svg>
                        🚚 Delivery within 4-5 days
                    </div>
                    <div className="flex flex-wrap gap-4">
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="10" rx="2" />
                                <path d="M7 11V8a5 5 0 0110 0v3" />
                            </svg>
                            Secure Payment
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 12a9 9 0 109 9" />
                                <path d="M3 4v5h5" />
                            </svg>
                            Easy Exchange
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="6" width="18" height="12" rx="2" />
                                <circle cx="12" cy="12" r="2.5" />
                                <path d="M6 12h.01M18 12h.01" />
                            </svg>
                            COD Available
                        </div>
                    </div>
                </div>

                {/* Additional Info (Care Instructions etc. from Wix) */}
                {product.additionalInfoSections?.map((section: any) => (
                    <div
                        className="border-t border-gray-100 pt-6"
                        key={section.title}
                    >
                        <details className="group">
                            <summary className="flex items-center justify-between cursor-pointer list-none">
                                <h4 className="font-semibold text-lg text-primary font-playfair">
                                    {section.title}
                                </h4>
                                <svg
                                    className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 9l-7 7-7-7"
                                    />
                                </svg>
                            </summary>
                            <div
                                className="mt-4 text-gray-600 leading-relaxed prose prose-sm max-w-none"
                                dangerouslySetInnerHTML={{
                                    __html: DOMPurify.sanitize(section.description || ""),
                                }}
                            />
                        </details>
                    </div>
                ))}

                {/* Reviews */}
                <ReviewsSection productName={product.name || undefined} />

                {/* Delivery Info */}
                <div className="bg-viora-gradient rounded-xl p-6 mt-4">
                    <h4 className="font-semibold text-primary mb-4 font-playfair text-lg">
                        Delivery Information
                    </h4>
                    <div className="space-y-4">
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                                <svg
                                    className="w-5 h-5 text-primary"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.5}
                                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                    />
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.5}
                                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                </svg>
                            </div>
                            <div>
                                <p className="font-medium text-gray-800">
                                    Pan India Delivery
                                </p>
                                <p className="text-sm text-gray-500">
                                    Delivery within 5-7 business days
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                                <svg
                                    className="w-5 h-5 text-primary"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.5}
                                        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                                    />
                                </svg>
                            </div>
                            <div>
                                <p className="font-medium text-gray-800">
                                    Cash on Delivery Available
                                </p>
                                <p className="text-sm text-gray-500">
                                    Pay when you receive your order
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                                <svg
                                    className="w-5 h-5 text-primary"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.5}
                                        d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                </svg>
                            </div>
                            <div>
                                <p className="font-medium text-gray-800">
                                    48 Hours Exchange
                                </p>
                                <p className="text-sm text-gray-500">
                                    Valid only for damaged or incorrect items
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <StickyAddToCart
                productId={product._id!}
                variantId="00000000-0000-0000-0000-000000000000"
                productName={product.name || "Unnamed Product"}
                productPrice={
                    product.price?.discountedPrice || product.price?.price || 0
                }
                productImage={product.media?.mainMedia?.image?.url}
                isOutOfStock={(product.stock?.quantity || 0) < 1}
                hasUnselectedVariants={
                    !!(product.variants && product.productOptions) &&
                    Object.keys(selectedOptions).length <
                        (product.productOptions?.length || 0)
                }
                triggerSelector={`#${STICKY_TRIGGER_ID}`}
            />
        </div>
    );
};

export default ProductView;
