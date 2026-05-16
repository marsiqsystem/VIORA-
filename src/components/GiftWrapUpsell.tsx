"use client";

import Link from "next/link";

type Props = {
  variant?: "compact" | "full";
  onNavigate?: () => void;
};

const GiftWrapUpsell = ({ variant = "full", onNavigate }: Props) => {
  const isCompact = variant === "compact";

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-[#9B1B30]/15 bg-gradient-to-r from-[#F5E8E2] via-[#FBF1ED] to-[#F5F1EA] ${
        isCompact ? "p-3" : "p-4 md:p-5"
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#9B1B30]/10 blur-2xl"
      />
      <div className="relative flex items-center gap-3">
        <span
          aria-hidden
          className={`flex shrink-0 items-center justify-center rounded-full bg-white shadow-md ${
            isCompact ? "h-9 w-9 text-lg" : "h-11 w-11 text-xl"
          }`}
        >
          🎁
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`font-playfair font-bold text-[#1A1410] ${
              isCompact ? "text-sm leading-snug" : "text-base"
            }`}
          >
            Is this a gift? <span className="text-[#9B1B30]">Make it unforgettable.</span>
          </p>
          <p
            className={`text-[#1A1410]/70 ${
              isCompact ? "text-[11px] leading-snug mt-0.5" : "text-xs mt-1"
            }`}
          >
            Add our custom gift wrapping for just{" "}
            <span className="font-semibold text-[#1A1410]">₹79</span>.
          </p>
        </div>
        <Link
          href="/gift-packaging"
          onClick={onNavigate}
          className={`shrink-0 rounded-full bg-[#9B1B30] font-semibold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-[#7d1626] active:scale-95 ${
            isCompact ? "px-3 py-2 text-[10px]" : "px-4 py-2.5 text-xs"
          }`}
        >
          Add Gift Wrap
        </Link>
      </div>
    </div>
  );
};

export default GiftWrapUpsell;
