"use client";

import Image, { getImageProps } from "next/image";
import { useState, useRef, useEffect } from "react";
import { useSwipeable } from "react-swipeable";

const ProductImages = ({
  items,
  isBestSeller = false,
  ribbon = "",
  discountPercent = 0,
  reelCount = 0,
  productName,
}: {
  items: any;
  isBestSeller?: boolean;
  /** Wix merchandising ribbon, e.g. "New Arrival". */
  ribbon?: string;
  discountPercent?: number;
  /** When > 0, a "Watch videos" pill links down to the reels row (#reels). */
  reelCount?: number;
  /** Used for image alt text. Falls back to a generic label when absent. */
  productName?: string;
}) => {
  const showRibbon =
    !!ribbon.trim() && !(isBestSeller && /best\s*seller/i.test(ribbon));
  const [index, setIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState<Record<string | number, boolean>>({});
  const start = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleNext = () => {
    setIndex((prev) => (prev + 1) % items.length);
    resetZoom();
  };

  const handlePrev = () => {
    setIndex((prev) => (prev - 1 + items.length) % items.length);
    resetZoom();
  };

  const resetZoom = () => {
    setIsZoomed(false);
    setPosition({ x: 0, y: 0 });
    setDragging(false);
    setIsMouseDown(false);
  };

  const handlers = useSwipeable({
    onSwipedLeft: handleNext,
    onSwipedRight: handlePrev,
    preventScrollOnSwipe: true,
    trackMouse: true,
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isZoomed || e.button !== 0) return;
    setIsMouseDown(true);
    start.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isZoomed || !isMouseDown || !containerRef.current) return;

    setDragging(true);
    const container = containerRef.current;
    const deltaX = e.clientX - start.current.x;
    const deltaY = e.clientY - start.current.y;

    const bounds = {
      x: container.offsetWidth * 0.5,
      y: container.offsetHeight * 0.5,
    };

    const clampedX = Math.max(Math.min(deltaX, bounds.x), -bounds.x);
    const clampedY = Math.max(Math.min(deltaY, bounds.y), -bounds.y);

    setPosition({ x: clampedX, y: clampedY });
  };

  const handleMouseUp = () => {
    setDragging(false);
    setIsMouseDown(false);
  };

  const handleImageLoad = (imageIndex: number) => {
    setImagesLoaded((prev) => ({ ...prev, [imageIndex]: true }));
  };

  useEffect(() => {
    if (!isZoomed) {
      setPosition({ x: 0, y: 0 });
    }
  }, [isZoomed]);

  // Preload the next image in the exact optimised size the gallery will request
  // (a raw Wix URL here downloaded the multi-MB original, which is never shown).
  useEffect(() => {
    if (!items || items.length === 0) return;
    const nextIndex = (index + 1) % items.length;
    const nextUrl = items[nextIndex]?.image?.url;
    if (!nextUrl) return;
    const { props } = getImageProps({
      src: nextUrl,
      alt: "",
      fill: true,
      sizes: "(max-width: 768px) 100vw, 50vw",
      quality: 75,
    });
    const img = new window.Image();
    if (props.sizes) img.sizes = props.sizes;
    if (props.srcSet) img.srcset = props.srcSet;
    img.src = props.src;
  }, [index, items]);

  if (!items || items.length === 0) {
    return (
      <div className="relative w-full aspect-square bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
        <svg className="w-16 h-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    // Mobile: big image with a thumbnail row below. md+: thumbnails in a column
    // to the LEFT of the image — flex-row-reverse keeps the image first in the DOM.
    <div className="relative flex w-full max-w-full select-none flex-col gap-3 md:flex-row-reverse md:gap-4">
      {/* BIG IMAGE — swipe handlers live here, not on the root, so scrolling the
          thumbnail strip never changes the photo. touch-action: pan-y stops the
          browser from committing a page-level horizontal scroll mid-swipe. */}
      <div
        className="group relative w-full max-w-full overflow-hidden md:flex-1"
        style={{ touchAction: "pan-y" }}
        {...handlers}
      >
        <div
          className="relative w-full max-w-full aspect-square overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100"
          onClick={() => setIsZoomed(!isZoomed)}
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            cursor: isZoomed
              ? dragging || isMouseDown
                ? "grabbing"
                : "grab"
              : "zoom-in",
          }}
        >
          {/* Loading Skeleton */}
          {!imagesLoaded[index] && (
            <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200 animate-pulse flex items-center justify-center">
              <div className="loading-spinner"></div>
            </div>
          )}

          <Image
            src={items[index].image?.url || "/product.png"}
            alt={
              productName
                ? `${productName} — Viora Jewel${index > 0 ? `, view ${index + 1}` : ""}`
                : "Viora Jewel product"
            }
            fill
            priority={index === 0}
            draggable={false}
            className={`object-cover transition-all duration-300 ${imagesLoaded[index] ? "opacity-100" : "opacity-0"
              }`}
            style={{
              transform: `scale(${isZoomed ? 1.5 : 1}) translate(${position.x}px, ${position.y}px)`,
              transition: dragging || isMouseDown ? "none" : "transform 0.3s ease, opacity 0.3s ease",
            }}
            onLoad={() => handleImageLoad(index)}
            onError={() => handleImageLoad(index)}
            sizes="(max-width: 768px) 100vw, 50vw"
            quality={75}
          />

          {/* Merchandising badges — same pills as the product cards: Best Seller
              (collection), the Wix ribbon, then the discount. */}
          {(isBestSeller || showRibbon || discountPercent > 0) && (
            <div className="pointer-events-none absolute top-4 left-4 z-10 flex flex-col items-start gap-1.5">
              {isBestSeller && (
                <span className="rounded-full bg-[#9B1B30] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow-sm">
                  Best Seller
                </span>
              )}
              {showRibbon && (
                <span className="rounded-full bg-[#9B1B30] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow-sm">
                  {ribbon}
                </span>
              )}
              {discountPercent > 0 && (
                <span className="rounded-full bg-[#1A1410] px-3 py-1 text-xs font-bold text-white shadow-sm">
                  {discountPercent}% OFF
                </span>
              )}
            </div>
          )}

          {/* Zoom Indicator */}
          <div className={`absolute top-4 right-4 bg-white/95 px-3 py-1.5 rounded-full text-xs font-medium text-gray-600 transition-opacity duration-200 z-10 ${isZoomed ? "opacity-0" : "opacity-0 group-hover:opacity-100"}`}>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
              Click to zoom
            </span>
          </div>

          {/* Jump to the product videos */}
          {reelCount > 0 && (
            <a
              href="#reels"
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" />
              </svg>
              Watch {reelCount === 1 ? "video" : `${reelCount} videos`}
            </a>
          )}

          {/* Image Counter */}
          <div className="absolute bottom-4 right-4 z-10 bg-white/95 px-3 py-1.5 rounded-full text-xs font-medium text-gray-600">
            {index + 1} / {items.length}
          </div>

          {/* PREV BUTTON */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/95 text-primary rounded-full z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center hover:bg-white shadow-md"
            aria-label="Previous image"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* NEXT BUTTON */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/95 text-primary rounded-full z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center hover:bg-white shadow-md"
            aria-label="Next image"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* THUMBNAILS — row on mobile; on md+ a column pinned to the image's height */}
      <div className="relative w-full max-w-full overflow-hidden md:w-20 md:flex-shrink-0 lg:w-24">
        {/* Edge fades for the horizontal strip (mobile only) */}
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-6 bg-gradient-to-r from-white to-transparent md:hidden" />
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-6 bg-gradient-to-l from-white to-transparent md:hidden" />

        <div className="flex w-full gap-2 overflow-x-auto px-3 scrollbar-hide md:absolute md:inset-0 md:flex-col md:gap-3 md:overflow-y-auto md:overflow-x-hidden md:px-0">
          {items.map((item: any, i: number) => (
            <button
              className={`relative h-20 w-20 shrink-0 overflow-hidden border-2 transition-all duration-200 md:aspect-square md:h-auto md:w-full ${i === index
                ? "border-primary shadow-md"
                : "border-transparent hover:border-gray-300"
                }`}
              key={item._id}
              onClick={() => {
                setIndex(i);
                resetZoom();
              }}
              aria-label={`View image ${i + 1}`}
            >
              {/* Thumbnail Loading State */}
              {!imagesLoaded[`thumb-${i}`] && (
                <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200 animate-pulse" />
              )}
              <Image
                src={item.image?.url || "/product.png"}
                alt={
                  productName
                    ? `${productName} — thumbnail ${i + 1}`
                    : `Product thumbnail ${i + 1}`
                }
                fill
                className={`object-cover transition-opacity duration-200 ${imagesLoaded[`thumb-${i}`] ? "opacity-100" : "opacity-0"
                  }`}
                onLoad={() => setImagesLoaded((prev) => ({ ...prev, [`thumb-${i}`]: true }))}
                onError={() => setImagesLoaded((prev) => ({ ...prev, [`thumb-${i}`]: true }))}
                sizes="96px"
                quality={60}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProductImages;
