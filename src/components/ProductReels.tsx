"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSwipeable } from "react-swipeable";
import ScrollRow from "@/components/ScrollRow";

/** A product video (public/reels or Wix media), built server-side in app/[slug]/page.tsx. */
export type ProductReel = {
  id: string;
  src: string;
  poster?: string;
  /** false for silent files (local reels are encoded without audio) — hides the sound toggle. */
  hasAudio?: boolean;
  /** Light clip + poster for the tile (full video plays in the viewer). */
  preview?: string;
  previewPoster?: string;
};

type Props = {
  reels: ProductReel[];
  productName: string;
  price: number;
  prepaidPrice: number;
  /** Where the viewer's "Shop now" button scrolls to (the buy buttons). */
  shopTargetSelector: string;
};

const PlayIcon = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" />
  </svg>
);

// Muted autoplay costs data, so skip it for Save-Data and reduced-motion users;
// they still get the poster and can tap to play.
const canAutoplay = () => {
  if (typeof window === "undefined") return false;
  const saveData = (navigator as any).connection?.saveData === true;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return !saveData && !reducedMotion;
};

const ReelTile = ({
  reel,
  index,
  paused,
  onOpen,
}: {
  reel: ProductReel;
  index: number;
  paused: boolean;
  onOpen: (index: number) => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !canAutoplay()) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.6 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (inView && !paused) el.play().catch(() => {});
    else el.pause();
  }, [inView, paused]);

  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      aria-label={`Play video ${index + 1}`}
      className="relative aspect-[9/16] w-[calc((100%-1rem)/3)] shrink-0 snap-start overflow-hidden rounded-lg bg-gray-900"
    >
      <video
        ref={videoRef}
        src={reel.preview || reel.src}
        poster={reel.previewPoster || reel.poster}
        muted
        loop
        playsInline
        preload="none"
        className="h-full w-full object-cover"
      />
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 text-[11px] font-semibold text-white">
        <PlayIcon />
        Watch
      </span>
    </button>
  );
};

/**
 * "See it in action" — horizontally scrolling reels of this product, muted
 * autoplay while on screen, and a full-screen viewer with a Shop now button.
 */
const ProductReels = ({ reels, productName, price, prepaidPrice, shopTargetSelector }: Props) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const viewerVideoRef = useRef<HTMLVideoElement>(null);

  const isOpen = openIndex !== null;
  const close = () => setOpenIndex(null);
  const next = () => setOpenIndex((i) => (i === null ? i : (i + 1) % reels.length));
  const prev = () =>
    setOpenIndex((i) => (i === null ? i : (i - 1 + reels.length) % reels.length));

  const swipe = useSwipeable({
    onSwipedUp: next,
    onSwipedLeft: next,
    onSwipedDown: prev,
    onSwipedRight: prev,
    preventScrollOnSwipe: true,
  });

  // Lock page scroll and wire up keyboard controls while the viewer is open.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Play with sound after the tap; if the browser refuses, fall back to muted.
  useEffect(() => {
    const el = viewerVideoRef.current;
    if (!el || openIndex === null) return;
    el.muted = muted;
    el.play().catch(() => {
      el.muted = true;
      setMuted(true);
      el.play().catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIndex]);

  useEffect(() => {
    if (viewerVideoRef.current) viewerVideoRef.current.muted = muted;
  }, [muted]);

  if (reels.length === 0) return null;

  const shopNow = () => {
    close();
    document
      .querySelector(shopTargetSelector)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const current = openIndex === null ? null : reels[openIndex];

  return (
    <section id="reels" aria-labelledby="reels-title" className="scroll-mt-24">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="reels-title" className="font-inter text-sm font-semibold uppercase tracking-wider text-primary">
          See it in action
        </h2>
        <span className="text-xs text-gray-500">
          {reels.length} {reels.length === 1 ? "video" : "videos"}
        </span>
      </div>

      <ScrollRow className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide md:mx-0 md:scroll-px-0 md:px-0">
        {reels.map((reel, i) => (
          <ReelTile key={reel.id} reel={reel} index={i} paused={isOpen} onOpen={setOpenIndex} />
        ))}
      </ScrollRow>

      {current &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${productName} videos`}
            className="fixed inset-0 z-[220] flex items-center justify-center bg-black"
          >
            <div className="relative h-full w-full max-w-md" {...swipe}>
              <video
                key={current.id}
                ref={viewerVideoRef}
                src={current.src}
                poster={current.poster}
                loop
                playsInline
                onClick={() => setMuted((m) => !m)}
                className="h-full w-full object-contain"
              />

              {/* Progress segments + controls */}
              <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-3">
                <div className="flex gap-1">
                  {reels.map((r, i) => (
                    <span
                      key={r.id}
                      className={`h-0.5 flex-1 rounded-full ${i === openIndex ? "bg-white" : "bg-white/35"}`}
                    />
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  {current.hasAudio === false ? (
                    <span className="text-xs font-semibold text-white/80">
                      {openIndex! + 1} / {reels.length}
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
                    onClick={close}
                    aria-label="Close videos"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              </div>

              {reels.length > 1 && (
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

              {/* Shop bar */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-6 pt-10">
                <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-lg">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-inter text-sm font-semibold text-primary">{productName}</p>
                    <p className="text-sm">
                      <span className="font-bold text-primary">₹{price}</span>
                      <span className="ml-1.5 text-xs font-semibold text-green-700">
                        ₹{prepaidPrice} if paid online
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={shopNow}
                    className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white"
                  >
                    Shop now
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </section>
  );
};

export default ProductReels;
