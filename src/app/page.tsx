import Image from "next/image";
import ProductList from "@/components/ProductList";
import Skeleton from "@/components/Skeleton";
import Slider from "@/components/Slider";
import Link from "next/link";
import { Suspense } from "react";
// Below-the-fold product rails are already deferred via the existing Suspense
// boundaries around ProductList (server-streamed), so no extra dynamic import
// is needed on this route.

const trustItems = [
  ["Trusted Quality", "Premium craftsmanship in every piece"],
  ["Secure checkout", "Protected payments every time"],
  ["Fast shipping", "Free delivery on all orders"],
  ["Easy Exchange", "48-hour support on eligible pieces"],
];

const occasionPills = [
  "Wedding/Reception",
  "Office parties",
  "Gifting",
];

const HomePage = async () => {
  return (
    // max-md:pb-28 reserves room at the bottom of the page on mobile so the
    // fixed B2G1 banner (sitting above the mobile bottom-nav at z-[60]) never
    // clips the last section of content. Desktop is unaffected.
    <div className="bg-platinum text-primary max-md:pb-28">
      {/* Mobile top-padding now lives inside <Slider /> itself (max-md:pt-24)
          so the hero owns its own spacing below the sticky header. The banner
          below is a sibling of <Slider /> — NOT a child of the hero's absolute
          context — so it flows naturally in the document. */}
      <Slider />

      {/*
        B2G1 banner — sibling of <Slider />, NOT a child of the hero.
        - Desktop (md+): static block in normal document flow, sits in the
          cream area directly below the hero, above the Bestsellers section.
        - Mobile (<md): fixed bottom strip above the MobileBottomNav (which
          is z-50 at bottom-0), pinned at bottom-[64px] with z-[60] so it
          stays visible over scrolling content but never overlaps the tab bar.
      */}
      <div
        className="w-full bg-[#9B1B30] text-white py-3 text-center text-sm md:text-base font-medium block
                   max-md:fixed max-md:left-0 max-md:right-0 max-md:bottom-[64px] max-md:z-[60]"
      >
        ✨ B2G1 FREE! Buy 2 sets &amp; get 1 absolutely FREE! (On selected pieces)
      </div>

      <section className="py-14 md:py-18 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="flex items-end justify-between gap-6 mb-8">
          <div>
            <span className="inline-block rounded-full bg-[#f3ca7e] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              BESTSELLERS
            </span>
            <h2 className="mt-3 text-3xl md:text-4xl font-playfair font-bold text-primary">
              Complete statement sets
            </h2>
            <p className="mt-2 max-w-xl text-sm md:text-base text-gray-800">
              Every set includes necklace, earrings & ring. No mix-matching. No guessing.
            </p>
          </div>
          <Link
            href="/list#product-grid"
            className="hidden sm:inline-flex items-center gap-2 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            View all
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
        <Suspense fallback={<Skeleton />}>
          <ProductList
            categoryId={process.env.FEATURED_PRODUCTS_FEATURED_CATEGORY_ID!}
            limit={4}
          />
        </Suspense>
      </section>

      <section className="bg-silver-light px-4 py-8 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-playfair text-2xl font-bold text-primary">
              Shop By Occasion
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Move shoppers quickly from intent to the right piece.
            </p>
          </div>
          <Link href="/list" className="text-sm font-semibold text-accent hover:text-primary">
            Explore
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory hide-scrollbar pb-1 md:flex-wrap md:overflow-visible md:snap-none">
          {occasionPills.map((label, index) => (
            <Link
              href="/list"
              key={label}
              className={`shrink-0 snap-center rounded-full border px-5 py-3 text-sm font-medium transition-colors min-h-[44px] inline-flex items-center ${
                index === 0
                  ? "border-accent bg-accent text-white"
                  : "border-primary/20 bg-platinum text-primary hover:border-accent hover:text-accent"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="relative w-full h-[60vh] md:h-[80vh] min-h-[420px] overflow-hidden flex items-center">
        {/* Background Image */}
        <div className="absolute inset-0 z-0 w-full h-full">
          <Image
            src="/banner-optimized.jpg"
            alt="Gifting collection banner"
            fill
            sizes="100vw"
            quality={70}
            loading="lazy"
            className="object-cover object-center w-full h-full"
          />
          <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-primary/80 via-primary/50 to-transparent" />
        </div>

        {/* Content — left aligned */}
        <div className="relative z-10 w-full px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24 py-16 md:py-20">
          <div className="max-w-xl">
            <span className="inline-block rounded-full border border-silver/40 bg-white/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-silver-light">
              For Gifting
            </span>

            <h2 className="mt-6 font-playfair text-3xl md:text-5xl font-bold leading-[1.1] text-white">
              The Full Set,
              <br />
              <span className="text-silver">Sorted.</span>
            </h2>

            <p className="mt-5 text-sm md:text-base leading-relaxed text-gray-300 max-w-md">
              Necklace · Earrings · Ring — beautifully gift-packed
              and delivered to her door.
            </p>

            <div className="mt-4 flex items-baseline gap-3">
              <span className="font-playfair text-3xl md:text-4xl font-bold text-silver">Under ₹700</span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">COD available · Fast delivery</span>
            </div>

            <div className="mt-8 flex items-center gap-5">
              <Link
                href="/list"
                className="inline-flex rounded-full bg-accent px-7 py-3 text-sm font-semibold text-white transition-all duration-300 hover:bg-white hover:text-primary"
              >
                Shop Gifting Sets
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-14 md:py-18 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24 bg-platinum-warm">
        <div className="flex items-end justify-between gap-6 mb-8">
          <div>
            <h2 className="text-3xl md:text-4xl font-playfair font-bold text-primary">
              Fresh From Viora
            </h2>
            <p className="text-gray-600 mt-2">New pieces for the cart-worthy moment.</p>
          </div>
          <Link
            href="/new-arrivals"
            className="hidden sm:inline-flex items-center gap-2 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            New arrivals
          </Link>
        </div>
        <Suspense fallback={<Skeleton />}>
          <ProductList
            categoryId={process.env.FEATURED_PRODUCTS_NEW_CATEGORY_ID!}
            limit={4}
          />
        </Suspense>
      </section>

      <section className="border-y border-silver-light bg-platinum px-4 py-10 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="grid grid-cols-2 gap-6 text-center md:grid-cols-4">
          {trustItems.map(([title, desc]) => (
            <div key={title}>
              <h4 className="font-playfair text-xl font-bold text-primary">{title}</h4>
              <p className="mt-1 text-sm text-gray-600">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default HomePage;
