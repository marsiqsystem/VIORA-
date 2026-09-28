import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { HERO_SLIDES, HOME_REELS } from "@/data/homeAssets";
import { PRODUCT_REELS, reelKey } from "@/data/productReels";
import {
  FESTIVE_COMBO,
  PREPAID_DISCOUNT,
  isFestiveComboLive,
} from "@/lib/checkoutPricing";
import { loadHomeData, sellingPrice } from "@/lib/homeData";
import HeroCarousel, { type HeroSlide } from "@/components/home/HeroCarousel";
import TrustStrip from "@/components/home/TrustStrip";
import HomeCategories from "@/components/home/HomeCategories";
import ProductRail from "@/components/home/ProductRail";
import WeeklyOrders from "@/components/home/WeeklyOrders";
import ShopByPrice from "@/components/home/ShopByPrice";
import OfferLadderBanner from "@/components/home/OfferLadderBanner";
import FestiveCombo from "@/components/home/FestiveCombo";
import HomeReels, { type HomeReel } from "@/components/home/HomeReels";
import ReviewsWall from "@/components/home/ReviewsWall";
import WhyViora from "@/components/home/WhyViora";
import BrandNote from "@/components/home/BrandNote";
import WhatsAppClub from "@/components/home/WhatsAppClub";

const FaqSection = dynamic(() => import("@/components/FaqSection"));

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const inWindow = (now: number, startsAt?: string, endsAt?: string) =>
  (!startsAt || now >= Date.parse(startsAt)) && (!endsAt || now <= Date.parse(endsAt));

/**
 * Home page, in the order a first-time visitor needs it: an offer and a worn
 * piece, reasons to trust, ways in (category, price), proof, then help.
 * Image slots and their placeholders live in src/data/homeAssets.ts.
 */
const HomePage = async ({ searchParams }: { searchParams?: { preview?: string } }) => {
  // ?preview=festive shows the festive campaign before it starts (for review).
  const now =
    searchParams?.preview === "festive" ? Date.parse(FESTIVE_COMBO.startsAt) + 1000 : Date.now();
  const festiveLive = isFestiveComboLive(now);
  const data = await loadHomeData();
  const fromLine = data.fromPrice ? `Sets from ₹${data.fromPrice}` : "Diamond-style sets & earrings";

  // Live price of an in-stock design for slide copy; null hides the slide (sold out).
  const catalogue = [...data.bestSellers, ...data.newArrivals];
  const priceOf = (baseName: string) => {
    const p = catalogue.find((q) => (q.name || "").split(" - ")[0].trim().toLowerCase() === baseName);
    return p ? sellingPrice(p) : null;
  };
  const noblePrice = priceOf("noble teardrop harmony set");
  const wingsPrice = priceOf("crystal wings set");

  const slideCopy: Record<string, Omit<HeroSlide, "id" | "desktop" | "mobile" | "variant" | "hideOnMobile">> = {
    "festive-combo": {
      eyebrow: `🪔 Festive combo · till ${FESTIVE_COMBO.endLabel}`,
      headline: `Any 2 pieces: ₹${FESTIVE_COMBO.amount} OFF`,
      sub: "Mix any two sets or earrings — the discount applies automatically at checkout.",
      cta: { label: "Pick my two", href: "#festive-combo" },
      countdown: true,
    },
    "best-sellers": {
      eyebrow: "Viora best sellers",
      headline: "Diamond-style sets that get noticed",
      sub: `${fromLine} · Pay online for FREE delivery + ₹${PREPAID_DISCOUNT} OFF · COD available`,
      cta: { label: "Shop best sellers", href: "#best-sellers" },
    },
    "noble-teardrop": {
      eyebrow: "Best seller · Noble Teardrop",
      headline: "Three rows of sparkle",
      sub: `₹${noblePrice} · ₹${(noblePrice || 0) - PREPAID_DISCOUNT} paying online, FREE delivery · COD available`,
      // The art shows the blue set.
      cta: { label: "Shop this set", href: "/ethnic-jewellery-set-d-005" },
    },
    "crystal-wings": {
      eyebrow: "Crystal Wings",
      headline: "Butterflies for every day",
      sub: `₹${wingsPrice} · in Red & Green`,
      cta: { label: "Shop Crystal Wings", href: "/crystal-wings-set-red" },
    },
    "little-more-you": {
      // The banner carries its own text; this copy is for phones (card) and screen readers.
      eyebrow: "Viora",
      headline: "A little more you",
      sub: `${fromLine} · COD available`,
      cta: { label: "Explore now", href: "/list#product-grid" },
    },
    wedding: {
      eyebrow: "Wedding season",
      headline: "Statement sets for every function",
      sub: `${fromLine} · COD available · 48-hour exchange`,
      cta: { label: "Shop wedding sets", href: "/list?cat=wedding-reception#product-grid" },
    },
  };

  const festiveSlideLive = festiveLive && data.comboPairs.length > 0;
  const soldOut: Partial<Record<string, boolean>> = {
    "noble-teardrop": noblePrice === null,
    "crystal-wings": wingsPrice === null,
  };
  const slides: HeroSlide[] = HERO_SLIDES.filter((slide) =>
    slide.id === "festive-combo"
      ? festiveSlideLive
      : inWindow(now, slide.startsAt, slide.endsAt) &&
        !(slide.hideDuringFestive && festiveSlideLive) &&
        !soldOut[slide.id]
  ).map((slide) => ({
    id: slide.id,
    desktop: slide.desktop,
    mobile: slide.mobile,
    variant: slide.variant,
    hideOnMobile: slide.hideOnMobile,
    ...slideCopy[slide.id],
  }));

  // Reels: designed home reels, then any product reels shipped with the site.
  const productBySlug = new Map(
    [...data.bestSellers, ...data.newArrivals].map((p) => [p.slug || "", p])
  );
  const productByReelKey = new Map(
    [...data.bestSellers, ...data.newArrivals].map((p) => [reelKey((p.name || "").split(" - ")[0]), p])
  );
  const reels: HomeReel[] = [
    ...HOME_REELS.map((r) => {
      const p = productBySlug.get(r.productSlug);
      return { ...r, productName: (p?.name || r.productSlug).split(" - ")[0], price: p ? sellingPrice(p) : undefined };
    }),
    // Each design's best (worn) reel first, then second reels, and so on —
    // ten different pieces beat four angles of one set.
    ...Object.entries(PRODUCT_REELS)
      .flatMap(([key, list]) => {
        const p = productByReelKey.get(key);
        if (!p?.slug) return [];
        return list.map((r, round) => ({
          round,
          src: r.src,
          poster: r.poster,
          preview: r.preview,
          previewPoster: r.previewPoster,
          productSlug: p.slug!,
          productName: (p.name || "").split(" - ")[0],
          price: sellingPrice(p),
        }));
      })
      .sort((a, b) => a.round - b.round)
      .map(({ round, ...reel }) => reel),
  ].slice(0, 10);

  return (
    <div className="bg-platinum text-primary">
      <HeroCarousel slides={slides} />
      <TrustStrip />
      <HomeCategories collectionImages={data.categoryImages} productImage={data.productImages[0]} />

      <div id="best-sellers" className="scroll-mt-24">
        <ProductRail
          id="best-sellers-title"
          eyebrow="Most loved"
          title="Best sellers"
          subtitle={<WeeklyOrders />}
          viewAllHref="/list?cat=best-sellers#product-grid"
          items={data.bestSellers}
        />
      </div>

      <ShopByPrice bands={data.priceBands} />
      <OfferLadderBanner />
      <FestiveCombo comboPairs={data.comboPairs} festiveLive={festiveLive} />

      <ProductRail
        id="more-to-love-title"
        eyebrow="New & more"
        title="More to love"
        viewAllHref="/list#product-grid"
        items={data.newArrivals}
        tone="white"
      />

      <HomeReels reels={reels} />
      <ReviewsWall summary={data.reviews} />
      <WhyViora productImages={data.productImages} />
      <BrandNote />
      <WhatsAppClub />
      <FaqSection limit={5} />
    </div>
  );
};

export default HomePage;
