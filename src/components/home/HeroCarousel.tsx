"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSwipeable } from "react-swipeable";
import type { HomeImage } from "@/data/homeAssets";
import { FESTIVE_COMBO } from "@/lib/checkoutPricing";
import AssetImage from "./AssetImage";

export type HeroSlide = {
  id: string;
  desktop: HomeImage;
  mobile: HomeImage;
  eyebrow: string;
  headline: string;
  sub: string;
  cta: { label: string; href: string };
  /** Counts down to the festive combo's real end date. */
  countdown?: boolean;
  /** See HeroSlideAsset.variant in data/homeAssets.ts. */
  variant?: "full" | "card" | "baked";
  hideOnMobile?: boolean;
};

const AUTOPLAY_MS = 6000;

const Countdown = () => {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (now === null) return null;
  const ms = Math.max(0, Date.parse(FESTIVE_COMBO.endsAt) - now);
  const parts = [
    [Math.floor(ms / 86_400_000), "days"],
    [Math.floor((ms % 86_400_000) / 3_600_000), "hrs"],
    [Math.floor((ms % 3_600_000) / 60_000), "min"],
    [Math.floor((ms % 60_000) / 1000), "sec"],
  ] as const;
  return (
    <div className="mt-4 flex gap-2" aria-label={`Offer ends ${FESTIVE_COMBO.endLabel}`}>
      {parts.map(([value, label]) => (
        <span key={label} className="min-w-[3.25rem] bg-white/95 px-2 py-1.5 text-center text-primary">
          <span className="block text-lg font-bold leading-none tabular-nums">{String(value).padStart(2, "0")}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
        </span>
      ))}
    </div>
  );
};

/** Home hero: jewellery-first slides with live offer text over clean artwork. */
const HeroCarousel = ({ slides: allSlides }: { slides: HeroSlide[] }) => {
  // Phones drop desktop-only slides (after mount; the first slide is never one).
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const slides = isPhone ? allSlides.filter((s) => !s.hideOnMobile) : allSlides;

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Slides render once shown, so only the first image competes for page load.
  const [shown, setShown] = useState<Set<number>>(() => new Set([0]));
  const count = slides.length;
  // Resizing to a phone can remove the slide being shown.
  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [index, count]);

  const go = (next: number) => {
    const i = (next + count) % count;
    setIndex(i);
    setShown((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
  };

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused, count]);

  const swipe = useSwipeable({
    onSwipedLeft: () => go(index + 1),
    onSwipedRight: () => go(index - 1),
    trackMouse: false,
  });

  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured offers"
      className="relative w-full overflow-hidden bg-primary"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      {...swipe}
    >
      {/* Phones: the whole 3:2 banner, then a copy panel (PHONE_PANEL) — nothing printed over the art.
          Desktop: the copy sits on the art as before. */}
      <div className="relative h-[calc(66.667vw+228px)] w-full md:aspect-[8/3] md:h-auto md:max-h-[640px]">
        {slides.map((slide, i) => {
          const active = i === index;
          if (!shown.has(i)) return null;
          const variant = slide.variant || "full";
          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              aria-hidden={!active}
              className={`absolute inset-0 transition-opacity duration-700 ${active ? "z-10 opacity-100" : "z-0 opacity-0"}`}
            >
              {/* ---- Phones ---- */}
              <div className="absolute inset-x-0 top-0 aspect-[3/2] md:hidden">
                <AssetImage image={slide.mobile} sizes="100vw" priority={i === 0} />
                {variant === "baked" && (
                  <Link
                    href={slide.cta.href}
                    tabIndex={-1}
                    aria-label={`${slide.headline} — ${slide.cta.label}`}
                    className="absolute inset-0"
                  />
                )}
              </div>
              <div className="absolute inset-x-0 bottom-0 flex h-[228px] flex-col px-4 pb-9 pt-4 text-white md:hidden">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/70">{slide.eyebrow}</p>
                {/* Baked banners already show their headline in the art. */}
                {variant !== "baked" && (
                  <h2 className="mt-1 font-playfair text-[1.6rem] font-bold leading-[1.1]">{slide.headline}</h2>
                )}
                {slide.countdown ? (
                  <Countdown />
                ) : (
                  <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-relaxed text-white/85">{slide.sub}</p>
                )}
                <div className="min-h-3 flex-1" />
                <Link
                  href={slide.cta.href}
                  tabIndex={active ? 0 : -1}
                  className="shrink-0 inline-flex w-full items-center justify-center bg-accent px-6 py-3 text-sm font-bold uppercase tracking-wider text-white"
                >
                  {slide.cta.label}
                </Link>
              </div>

              {/* ---- Desktop ---- */}
              <div className="absolute inset-0 hidden md:block">
                <AssetImage image={slide.desktop} sizes="100vw" priority={i === 0} />
              </div>
              {variant === "full" && (
                <>
                  {/* Readability: left fade */}
                  <div className="absolute inset-0 hidden bg-gradient-to-r from-black/70 via-black/30 to-transparent md:block" />
                  <div className="absolute inset-y-0 left-0 hidden w-[52%] flex-col justify-center px-10 text-white md:flex lg:px-16">
                    <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/80">{slide.eyebrow}</p>
                    <h1 className="mt-2 font-playfair text-5xl font-bold leading-[1.05] lg:text-6xl">{slide.headline}</h1>
                    <p className="mt-3 max-w-md text-base font-medium leading-relaxed text-white/90">{slide.sub}</p>
                    {slide.countdown && <Countdown />}
                    <Link
                      href={slide.cta.href}
                      tabIndex={active ? 0 : -1}
                      className="mt-5 inline-flex items-center justify-center self-start bg-accent px-8 py-3.5 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-white hover:text-primary"
                    >
                      {slide.cta.label}
                    </Link>
                  </div>
                </>
              )}
              {variant === "card" && (
                // Busy art (faces, collages): a small card at the bottom centre instead of a fade.
                <div className="absolute bottom-10 left-1/2 hidden w-[380px] -translate-x-1/2 bg-white/95 p-5 text-primary shadow-lg md:block">
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">{slide.eyebrow}</p>
                  <h1 className="mt-1 font-playfair text-3xl font-bold leading-tight">{slide.headline}</h1>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-gray-600">{slide.sub}</p>
                  <Link
                    href={slide.cta.href}
                    tabIndex={active ? 0 : -1}
                    className="mt-3 inline-flex w-full items-center justify-center bg-accent px-6 py-3 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-primary"
                  >
                    {slide.cta.label}
                  </Link>
                </div>
              )}
              {variant === "baked" && (
                // The art carries its own headline and button — the whole slide is the link.
                <Link
                  href={slide.cta.href}
                  tabIndex={active ? 0 : -1}
                  aria-label={`${slide.headline} — ${slide.cta.label}`}
                  className="absolute inset-0 hidden md:block"
                />
              )}
            </div>
          );
        })}

        {count > 1 && (
          <>
            <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center gap-2">
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Show slide ${i + 1}`}
                  aria-current={i === index}
                  className={`h-1.5 transition-all ${i === index ? "w-7 bg-white" : "w-3 bg-white/50"}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous slide"
              className="absolute left-3 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center bg-white/20 text-2xl text-white backdrop-blur hover:bg-white/40 md:flex"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next slide"
              className="absolute right-3 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center bg-white/20 text-2xl text-white backdrop-blur hover:bg-white/40 md:flex"
            >
              ›
            </button>
          </>
        )}
      </div>
    </section>
  );
};

export default HeroCarousel;
