"use client";

import Image from "next/image";
import Link from "next/link";

const Slider = () => {
  return (
    <section className="relative w-full min-h-[500px] md:h-[80vh] flex items-center bg-platinum max-md:pt-24">
      {/* Background Image — object-cover + object-center keeps the necklace
          centred on every viewport; no max-h / overflow-hidden cropping. */}
      <div className="absolute inset-0 z-0 w-full h-full">
        <Image
          src="/hero-optimized.jpg"
          alt="Viora Jewels curated jewellery and accessories"
          fill
          sizes="100vw"
          quality={70}
          fetchPriority="high"
          className="object-cover object-center w-full h-full"
          priority
        />
        {/* Dark overlay for better text readability */}
        <div className="absolute inset-0 w-full h-full bg-black/40" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full flex flex-col justify-center px-4 py-14 md:px-8 lg:px-12 xl:px-16 2xl:px-24 text-white">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-platinum">
          Viora Jewels
        </p>
        <h1 className="max-w-3xl font-playfair text-5xl font-bold leading-[0.95] md:text-7xl lg:text-8xl">
          Jewellery That Sells The Moment.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-gray-200 md:text-lg">
          Discover polished everyday jewels, meaningful gifts, and occasion-ready
          pieces built for quick checkout and repeat carts.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/list"
            className="inline-flex items-center justify-center rounded-full bg-accent px-8 py-4 text-sm font-semibold uppercase tracking-wide text-white transition-all duration-300 hover:bg-white hover:text-primary"
          >
            Shop Now
          </Link>
          <Link
            href="/new-arrivals"
            className="inline-flex items-center justify-center rounded-full border border-white px-8 py-4 text-sm font-semibold uppercase tracking-wide text-white transition-all duration-300 hover:bg-white hover:text-primary"
          >
            New Arrivals
          </Link>
        </div>

        {/* Feature items: stack vertically on mobile, 3 columns on md+ */}
        <div className="mt-10 mb-4 max-w-xl grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 border-t border-white/30 pt-6">
          <div>
            <p className="font-playfair text-2xl font-bold text-white">Premium</p>
            <p className="font-inter text-xs font-medium tracking-wide text-white/80">Quality Assured</p>
          </div>
          <div>
            <p className="font-playfair text-2xl font-bold text-white">Free</p>
            <p className="font-inter text-xs font-medium tracking-wide text-white/80">Shipping on all orders</p>
          </div>
          <div>
            <p className="font-playfair text-2xl font-bold text-white">24/7</p>
            <p className="font-inter text-xs font-medium tracking-wide text-white/80">Customer support</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Slider;
