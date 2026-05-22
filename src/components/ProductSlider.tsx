"use client";

import { products } from "@wix/stores";
import { useCallback, useEffect, useRef, useState } from "react";
import ProductCard from "./ProductCard";

/**
 * Horizontal, snap-scrolling product carousel.
 *
 * - Touch devices: native momentum scroll (smooth + snap), one swipe per card.
 * - Desktop / Windows: prev / next arrow buttons scroll by a viewport-width
 *   step; the buttons auto-disable at each end.
 *
 * Reuses <ProductCard /> so cards stay identical to the listing grid.
 */
const ProductSlider = ({ items }: { items: products.Product[] }) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // 1px tolerance avoids sub-pixel rounding leaving a button stuck enabled.
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows]);

  const scrollByStep = (direction: "left" | "right") => {
    const el = scrollerRef.current;
    if (!el) return;
    // Scroll ~80% of the visible width so a card always stays partly in view.
    const step = el.clientWidth * 0.8;
    el.scrollBy({ left: direction === "left" ? -step : step, behavior: "smooth" });
  };

  if (!items.length) return null;

  return (
    <div className="relative">
      {/* Prev — desktop only (touch users swipe) */}
      <button
        type="button"
        onClick={() => scrollByStep("left")}
        aria-label="Scroll to previous products"
        disabled={!canScrollLeft}
        className={`absolute left-0 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-premium transition-opacity duration-200 md:flex ${
          canScrollLeft ? "opacity-100 hover:bg-platinum" : "pointer-events-none opacity-0"
        }`}
      >
        <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div
        ref={scrollerRef}
        className="hide-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2 md:gap-6"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {items.map((product, index) => (
          <div
            key={product._id}
            className="w-[46%] shrink-0 snap-start sm:w-[38%] md:w-[31%] lg:w-[23%]"
          >
            <ProductCard product={product} index={index} />
          </div>
        ))}
      </div>

      {/* Next — desktop only */}
      <button
        type="button"
        onClick={() => scrollByStep("right")}
        aria-label="Scroll to next products"
        disabled={!canScrollRight}
        className={`absolute right-0 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-premium transition-opacity duration-200 md:flex ${
          canScrollRight ? "opacity-100 hover:bg-platinum" : "pointer-events-none opacity-0"
        }`}
      >
        <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
};

export default ProductSlider;
