import Image from "next/image";
import ProductList from "@/components/ProductList";
import Skeleton from "@/components/Skeleton";
import Slider from "@/components/Slider";
import Link from "next/link";
import { Suspense } from "react";
import { WIX_COLLECTION_IDS } from "@/lib/categories";
import CategoryStrip from "@/components/CategoryStrip";
import { wixClientServer } from "@/lib/wixClientServer";
import { getCategoryImageMap } from "@/lib/getCategoryImageMap";
// Below-the-fold product rails are already deferred via the existing Suspense
// boundaries around ProductList (server-streamed), so no extra dynamic import
// is needed on this route.

const trustItems = [
  {
    title: "Trusted Quality",
    desc: "Premium craftsmanship in every piece",
    icon: (
      <svg className="w-6 h-6 text-[#9B1B30]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    )
  },
  {
    title: "Secure Checkout",
    desc: "Protected payments every time",
    icon: (
      <svg className="w-6 h-6 text-[#9B1B30]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 11V8a5 5 0 0110 0v3" />
      </svg>
    )
  },
  {
    title: "Fast Shipping",
    desc: "Free delivery on all orders",
    icon: (
      <svg className="w-6 h-6 text-[#9B1B30]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V14a1 1 0 01-1 1h-1m-3-1v-4h-3m-5 0h.01" />
      </svg>
    )
  },
  {
    title: "Easy Exchange",
    desc: "48-hour support on eligible pieces",
    icon: (
      <svg className="w-6 h-6 text-[#9B1B30]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    )
  }
];

const HomePage = async () => {
  const wixClient = await wixClientServer();
  const categoryImageBySlug = await getCategoryImageMap(wixClient);

  return (
    // max-md:pb-28 reserves room at the bottom of the page on mobile so the
    // fixed offer banner (sitting above the mobile bottom-nav at z-[60]) never
    // clips the last section of content. Desktop is unaffected.
    <div className="bg-platinum text-primary">
      {/* Mobile top-padding now lives inside <Slider /> itself (max-md:pt-24)
          so the hero owns its own spacing below the sticky header. The banner
          below is a sibling of <Slider /> — NOT a child of the hero's absolute
          context — so it flows naturally in the document. */}
      <Slider />

      {/*
        Offer banner — sibling of <Slider />, NOT a child of the hero.
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
        ✨ FLAT ₹50 DISCOUNT on orders above ₹700 (Code: SHINE50) | 10% DISCOUNT on orders above ₹999 (Code: CLUBVIORA) ✨
      </div>

      <section className="px-4 pb-4 pt-14 md:px-8 md:pb-5 md:pt-18 lg:px-12 xl:px-16 2xl:px-24">
        <div className="flex items-end justify-between gap-6 mb-8">
          <div>
            <span className="inline-block rounded-full bg-[#f3ca7e] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              ALL PRODUCTS
            </span>
            <h2 className="mt-3 text-3xl md:text-4xl font-playfair font-bold text-primary">
              Explore every Viora set
            </h2>
            <p className="mt-2 max-w-xl text-sm md:text-base text-gray-800">
              Browse all available necklace, earrings & ring sets in one place.
            </p>
          </div>
          <Link
            href="/list?cat=all-products#product-grid"
            className="hidden sm:inline-flex items-center gap-2 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            View all
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
        <Suspense fallback={<Skeleton />}>
          <ProductList
            categoryId={WIX_COLLECTION_IDS.allProducts}
            limit={4}
          />
        </Suspense>
        <Suspense fallback={<Skeleton />}>
          <ProductList
            categoryId={WIX_COLLECTION_IDS.newArrivals}
            limit={4}
            featuredNames={["Zara Crystal Set", "Rosa Blush Set", "Garnet Royale Set", "Crystal Drop Set"]}
          />
        </Suspense>
      </section>

      <section className="bg-platinum px-4 pb-10 pt-4 md:px-8 md:pt-5 lg:px-12 xl:px-16 2xl:px-24">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-playfair text-2xl font-bold text-primary">
              Categories
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Browse every Viora collection.
            </p>
          </div>
          <Link href="/list" className="text-sm font-semibold text-accent hover:text-primary">
            View all
          </Link>
        </div>
        <CategoryStrip imageBySlug={categoryImageBySlug} />
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
              Necklace · Earrings · Ring, styled as a complete set
              and delivered to her door.
            </p>

            <div className="mt-4 flex items-baseline gap-3">
              <span className="font-playfair text-3xl md:text-4xl font-bold text-silver">Under ₹649</span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">COD available · Fast delivery</span>
            </div>

            <div className="mt-8 flex items-center gap-5">
              <Link
                href="/list?cat=gifting#product-grid"
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
            categoryId={WIX_COLLECTION_IDS.freshFromViora}
            limit={4}
          />
        </Suspense>
      </section>

      <section className="border-t border-silver-light bg-white px-4 py-12 md:px-8 lg:px-16 2xl:px-24">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4 md:gap-6 max-w-7xl mx-auto">
          {trustItems.map((item) => (
            <div
              key={item.title}
              className="flex flex-row md:flex-col items-center md:items-start gap-4 p-5 md:p-6 bg-platinum/40 rounded-2xl border border-silver-light/30 hover:shadow-premium hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-[#9B1B30]/5 text-[#9B1B30] flex-shrink-0">
                {item.icon}
              </div>
              <div className="flex flex-col text-left gap-0.5">
                <h4 className="font-playfair text-base md:text-lg font-bold text-primary leading-tight">
                  {item.title}
                </h4>
                <p className="text-xs md:text-sm text-gray-600 leading-normal">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default HomePage;
