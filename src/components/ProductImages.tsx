"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { useSwipeable } from "react-swipeable";

const ProductImages = ({
  items,
  rating = 4.8,
  isBestSeller = false,
}: {
  items: any;
  rating?: number;
  isBestSeller?: boolean;
}) => {
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

  // Preload next image — pass the raw Wix URL; next/image handles sizing.
  useEffect(() => {
    if (!items || items.length === 0) return;
    const nextIndex = (index + 1) % items.length;
    const nextUrl = items[nextIndex]?.image?.url;
    if (!nextUrl) return;
    const img = new window.Image();
    img.src = nextUrl;
  }, [index, items]);

  if (!items || items.length === 0) {
    return (
      <div className="relative w-full aspect-square bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center">
        <svg className="w-16 h-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    // w-full + overflow-hidden on the swipe-handler root guarantees no horizontal
    // bleed during a swipe gesture. touch-action: pan-y stops the browser from
    // committing a page-level horizontal scroll while the user swipes the image.
    <div
      className="relative group select-none w-full max-w-full overflow-hidden"
      style={{ touchAction: "pan-y" }}
      {...handlers}
    >
      {/* BIG IMAGE CONTAINER */}
      <div
        className="relative w-full max-w-full aspect-square overflow-hidden rounded-none md:rounded-xl bg-gradient-to-br from-gray-50 to-gray-100"
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
          alt="product"
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

        {/* Best Seller Badge — only for products in the Best Sellers collection */}
        {isBestSeller && (
          <div className="absolute top-4 left-4 z-10 bg-gray-900 text-white text-xs font-semibold px-2.5 py-1 rounded shadow-md flex items-center gap-1">
            ⚡ Best Seller
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

        {/* Rating Badge (Flipkart-style) */}
        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1 bg-white/95 px-2.5 py-1 rounded-full shadow-md text-sm font-semibold text-[#1A1410]">
          {rating.toFixed(1)}
          <svg className="w-3.5 h-3.5 text-[#9B1B30]" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </div>

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

      {/* THUMBNAILS */}
      <div className="relative mt-3 md:mt-4 w-full max-w-full overflow-hidden">
        {/* Left fade — uses platinum on mobile to match page bg, white on desktop card area */}
        <div className="pointer-events-none absolute left-0 top-0 h-full w-6 md:w-8 bg-gradient-to-r from-platinum md:from-white to-transparent z-10" />

        {/* Right fade */}
        <div className="pointer-events-none absolute right-0 top-0 h-full w-6 md:w-8 bg-gradient-to-l from-platinum md:from-white to-transparent z-10" />

        <div className="flex gap-2 md:gap-3 overflow-x-auto scrollbar-hide px-3 md:px-2 w-full">
          {items.map((item: any, i: number) => (
            <button
              className={`relative min-w-[4.5rem] h-24 rounded-lg overflow-hidden shrink-0 border-2 transition-all duration-200 ${i === index
                ? "border-primary shadow-md"
                : "border-transparent hover:border-silver"
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
                alt={`Product thumbnail ${i + 1}`}
                fill
                className={`object-cover transition-opacity duration-200 ${imagesLoaded[`thumb-${i}`] ? "opacity-100" : "opacity-0"
                  }`}
                onLoad={() => setImagesLoaded((prev) => ({ ...prev, [`thumb-${i}`]: true }))}
                onError={() => setImagesLoaded((prev) => ({ ...prev, [`thumb-${i}`]: true }))}
                sizes="80px"
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
