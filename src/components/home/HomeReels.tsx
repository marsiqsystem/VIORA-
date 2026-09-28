"use client";

import Link from "next/link";
import ScrollRow from "@/components/ScrollRow";
import { useEffect, useRef, useState } from "react";

export type HomeReel = {
  src: string;
  poster?: string;
  /** Light clip + poster for the tile. */
  preview?: string;
  previewPoster?: string;
  productSlug: string;
  productName: string;
  price?: number;
};

const ReelTile = ({ reel }: { reel: HomeReel }) => {
  const ref = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saveData = (navigator as any).connection?.saveData === true;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (saveData || reduced) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.6 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (inView) el.play().catch(() => {});
    else el.pause();
  }, [inView]);

  return (
    <li className="w-[44%] shrink-0 snap-start md:w-[18%]">
      <Link href={`/${reel.productSlug}`} className="group relative block aspect-[9/16] overflow-hidden bg-primary">
        <video
          ref={ref}
          src={reel.preview || reel.src}
          poster={reel.previewPoster || reel.poster}
          muted
          loop
          playsInline
          preload="none"
          className="h-full w-full object-cover"
        />
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 p-3 text-white">
          <span className="line-clamp-2 block text-sm font-semibold leading-tight">{reel.productName}</span>
          {reel.price ? <span className="mt-0.5 block text-xs text-white/85">₹{reel.price} · Shop now →</span> : null}
        </span>
      </Link>
    </li>
  );
};

/** "Worn by you" — real videos of the jewellery, each linking to its product. */
const HomeReels = ({ reels }: { reels: HomeReel[] }) => {
  if (reels.length === 0) return null;
  return (
    <section aria-labelledby="home-reels" className="bg-primary px-4 py-10 text-white md:px-6 md:py-14 lg:px-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-silver">See it sparkle</p>
      <h2 id="home-reels" className="mt-1 font-playfair text-3xl font-bold md:text-4xl">
        Worn by you
      </h2>
      <div className="mt-5">
        <ScrollRow as="ul" tone="dark" className="scrollbar-hide -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          {reels.map((reel) => (
            <ReelTile key={reel.src} reel={reel} />
          ))}
        </ScrollRow>
      </div>
    </section>
  );
};

export default HomeReels;
