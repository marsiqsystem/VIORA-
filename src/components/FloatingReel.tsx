"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSwipeable } from "react-swipeable";

/**
 * Site-wide floating reel: a small muted video bubble in the bottom-left corner
 * that opens a full-screen, story-style viewer with a Shop now bar on every
 * video. Movement in the corner of the eye gets looked at, and a woman wearing
 * the piece sells it better than any photo.
 *
 * - Everywhere: the try-on videos in FLOATING_REELS (src/data/productReels.ts),
 *   priced live by /api/floating-reels (sold-out designs dropped).
 * - Product pages: only THIS product's videos (ProductView calls
 *   useProductFloatingReel), so it never pulls a shopper away from the piece
 *   she's looking at. Products without videos get the site-wide ones in a
 *   random order (fresh pieces to discover instead of an empty corner).
 * - Hidden where it would distract from paying or reading: bag, checkout,
 *   account, tracking and policy pages. The × shrinks it to a small round
 *   button (remembered for the session); tapping that brings the video back.
 */

export type FloatingReelItem = {
  src: string;
  poster?: string;
  hasAudio?: boolean;
  /** Light clip + poster for the bubble (the viewer plays `src`). */
  preview?: string;
  previewPoster?: string;
  productName: string;
  price?: number;
  prepaidPrice?: number;
  /** Product page link; omitted on the product's own page. */
  slug?: string;
};

type Override = {
  items: FloatingReelItem[];
  /** Scrolls here from "Shop now" (the product page's buy buttons). */
  shopTargetSelector?: string;
} | null;

const Ctx = createContext<{ setOverride: (o: Override | undefined) => void }>({ setOverride: () => {} });

const HIDDEN_PREFIXES = [
  "/cart", "/checkout", "/success", "/account", "/profile", "/orders", "/track", "/login",
  "/recover", "/order-fix", "/dashboard", "/inbox", "/broadcast",
  "/privacy-policy", "/terms-and-conditions", "/shipping-policy", "/exchange-policy",
];
const MINIMIZED_KEY = "viora_floating_reel_minimized";
// Let the page's own content (and its LCP image) load first.
const SHOW_AFTER_MS = 2500;

const canAutoplay = () => {
  const saveData = (navigator as any).connection?.saveData === true;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return !saveData && !reducedMotion;
};

/** Product pages: show this product's reels in the bubble (null = none; site-wide reels, shuffled). */
export function useProductFloatingReel(override: Override) {
  const { setOverride } = useContext(Ctx);
  const signature = override ? override.items.map((i) => i.src).join("|") + (override.items[0]?.price ?? "") : "";
  useEffect(() => {
    setOverride(override);
    return () => setOverride(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}

const Viewer = ({
  items,
  start,
  onClose,
  shopTargetSelector,
}: {
  items: FloatingReelItem[];
  start: number;
  onClose: () => void;
  shopTargetSelector?: string;
}) => {
  const [index, setIndex] = useState(start);
  const [muted, setMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const current = items[index];
  const next = () => setIndex((i) => (i + 1) % items.length);
  const prev = () => setIndex((i) => (i - 1 + items.length) % items.length);

  const swipe = useSwipeable({
    onSwipedUp: next,
    onSwipedLeft: next,
    onSwipedDown: prev,
    onSwipedRight: prev,
    preventScrollOnSwipe: true,
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sound on after the tap; fall back to muted if the browser refuses.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    el.play().catch(() => {
      el.muted = true;
      setMuted(true);
      el.play().catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const shopOnPage = () => {
    onClose();
    if (shopTargetSelector) {
      document.querySelector(shopTargetSelector)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${current.productName} video`}
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black"
    >
      <div className="relative h-full w-full max-w-md" {...swipe}>
        <video
          key={current.src}
          ref={videoRef}
          src={current.src}
          poster={current.poster}
          playsInline
          // Stories: move on to the next piece when one ends.
          loop={items.length === 1}
          onEnded={next}
          onClick={() => setMuted((m) => !m)}
          className="h-full w-full object-contain"
        />

        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-3">
          <div className="flex gap-1">
            {items.map((item, i) => (
              <span key={item.src} className={`h-0.5 flex-1 rounded-full ${i === index ? "bg-white" : "bg-white/35"}`} />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            {current.hasAudio === false ? (
              <span className="text-xs font-semibold text-white/80">
                {index + 1} / {items.length}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white"
              >
                {muted ? "🔇 Tap for sound" : "🔊 Sound on"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close video"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous video"
              className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white md:flex"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next video"
              className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white md:flex"
            >
              ›
            </button>
          </>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-6 pt-10">
          <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-lg">
            <div className="min-w-0 flex-1">
              <p className="truncate font-inter text-sm font-semibold text-primary">{current.productName}</p>
              {current.price ? (
                <p className="text-sm">
                  <span className="font-bold text-primary">₹{current.price}</span>
                  {current.prepaidPrice ? (
                    <span className="ml-1.5 text-xs font-semibold text-green-700">₹{current.prepaidPrice} if paid online</span>
                  ) : null}
                </p>
              ) : null}
            </div>
            {current.slug ? (
              <Link
                href={`/${current.slug}`}
                onClick={onClose}
                className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white"
              >
                Shop now
              </Link>
            ) : (
              <button
                type="button"
                onClick={shopOnPage}
                className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white"
              >
                Shop now
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const Bubble = ({ override }: { override: Override | undefined }) => {
  const pathname = usePathname() || "/";
  const [ready, setReady] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [siteItems, setSiteItems] = useState<FloatingReelItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const hiddenHere = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    try {
      setMinimized(sessionStorage.getItem(MINIMIZED_KEY) === "1");
    } catch {}
    const timer = setTimeout(() => setReady(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const onProductPage = override !== undefined;
  const productHasReels = !!override && override.items.length > 0;

  // Site-wide reels are only fetched once they're actually needed.
  const needSiteItems = ready && !hiddenHere && !productHasReels && siteItems === null;
  useEffect(() => {
    if (!needSiteItems) return;
    let cancelled = false;
    fetch("/api/floating-reels")
      .then((r) => (r.ok ? r.json() : []))
      .then((items: FloatingReelItem[]) => !cancelled && setSiteItems(items))
      .catch(() => !cancelled && setSiteItems([]));
    return () => {
      cancelled = true;
    };
  }, [needSiteItems]);

  // A product page without videos shuffles the site-wide reels (new order on each such page).
  const fallbackItems = useMemo(() => {
    const list = siteItems || [];
    if (override !== null) return list;
    const shuffled = [...list];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [siteItems, override]);
  const items = productHasReels ? override!.items : fallbackItems;
  const visible = ready && !hiddenHere && items.length > 0;
  const first = items[0];

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !visible) return;
    if (!open && canAutoplay()) el.play().catch(() => {});
    else el.pause();
  }, [visible, open, minimized, first?.src]);

  if (!visible || !first) return null;

  const setMin = (value: boolean) => {
    setMinimized(value);
    try {
      sessionStorage.setItem(MINIMIZED_KEY, value ? "1" : "0");
    } catch {}
  };

  // Clear the bottom nav, and on product pages the sticky Add to bag bar too.
  const position = `fixed left-3 z-40 md:bottom-6 md:left-6 ${onProductPage ? "bottom-[184px]" : "bottom-[80px]"} animate-fade-in`;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMin(false)}
        aria-label="Show videos"
        className={`${position} flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-primary shadow-xl ring-2 ring-white`}
      >
        {(first.previewPoster || first.poster) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={first.previewPoster || first.poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <span className="absolute inset-0 bg-black/35" />
        <span className="absolute inset-0 animate-ping rounded-full ring-2 ring-accent/60 [animation-duration:2.5s]" />
        <svg className="relative h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" />
        </svg>
      </button>
    );
  }

  return (
    <>
      <div className={position}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Watch ${first.productName} video`}
          className="relative block h-[140px] w-[80px] overflow-hidden rounded-2xl bg-primary shadow-xl ring-2 ring-white md:h-[196px] md:w-[110px]"
        >
          <video
            ref={videoRef}
            key={first.src}
            src={first.preview || first.src}
            poster={first.previewPoster || first.poster}
            muted
            loop
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <span className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            {items.length > 1 ? `${items.length} videos` : "Watch"}
          </span>
          <span className="pointer-events-none absolute inset-x-0 bottom-0 p-1.5 text-left text-white">
            {first.price && !productHasReels ? (
              <span className="block text-[11px] font-bold leading-tight">₹{first.price}</span>
            ) : null}
            <span className="block text-[10px] font-semibold leading-tight text-white/90">
              {productHasReels ? "See it live ▶" : "Tap to shop ▶"}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMin(true)}
          aria-label="Minimise video"
          className="absolute -right-2.5 -top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-white text-primary shadow-md"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {open && (
        <Viewer
          items={items}
          start={0}
          onClose={() => setOpen(false)}
          shopTargetSelector={productHasReels ? override!.shopTargetSelector : undefined}
        />
      )}
    </>
  );
};

export function FloatingReelProvider({ children }: { children: React.ReactNode }) {
  // undefined = not a product page (site-wide reels); null = product page without videos.
  const [override, setOverride] = useState<Override | undefined>(undefined);
  return (
    <Ctx.Provider value={{ setOverride }}>
      {children}
      <Bubble override={override} />
    </Ctx.Provider>
  );
}
