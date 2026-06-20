"use client";

import Link from "next/link";
import { memo } from "react";

export type ColorSibling = {
  id: string;
  slug: string;
  name: string;
  colorLabel: string;
};

// Curated palette for common color names. Falls back to neutral if a label
// doesn't match — the swatch still renders so the user sees there's a variant.
const COLOR_HEX: Record<string, string> = {
  red: "#9B1B30",
  maroon: "#5C0A18",
  burgundy: "#6B1A2C",
  wine: "#722F37",
  pink: "#E48BA8",
  rose: "#D5849A",
  peach: "#F4B393",
  orange: "#E07A2A",
  yellow: "#E6C24B",
  golden: "#D4AF37",
  gold: "#D4AF37",
  green: "#0F5C3A",
  emerald: "#1F8A5A",
  teal: "#0F7C7C",
  blue: "#1B3A6B",
  navy: "#0F2A52",
  sky: "#7AB7E0",
  aqua: "#5CC6D0",
  cyan: "#5CC6D0",
  turquoise: "#40C4B4",
  purple: "#6A2D8A",
  violet: "#6A2D8A",
  lavender: "#B5A4D0",
  black: "#1A1410",
  ink: "#1A1410",
  grey: "#7C7C7C",
  gray: "#7C7C7C",
  silver: "#C0C0C0",
  white: "#F5F1EA",
  ivory: "#F1E7D2",
  pearl: "#EDE6D6",
  brown: "#5C3A22",
  beige: "#D9C5A4",
  champagne: "#E7D4A8",
};

const resolveColor = (label: string): string => {
  const key = label.trim().toLowerCase();
  if (COLOR_HEX[key]) return COLOR_HEX[key];
  for (const word of key.split(/\s+/)) {
    if (COLOR_HEX[word]) return COLOR_HEX[word];
  }
  return "#C9A66B";
};

type Props = {
  currentId: string;
  currentColor: string;
  siblings: ColorSibling[];
};

const ColorVariantSwatches = ({ currentId, currentColor, siblings }: Props) => {
  if (!siblings || siblings.length <= 1) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-[#1A1410]">
          Choose Color
        </h4>
        {currentColor && (
          <span className="text-xs text-gray-500">{currentColor}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {siblings.map((sib) => {
          const isActive = sib.id === currentId;
          const swatch = resolveColor(sib.colorLabel);
          return (
            <Link
              key={sib.id}
              href={`/${sib.slug}`}
              scroll={false}
              aria-label={`Switch to ${sib.colorLabel}`}
              aria-pressed={isActive}
              title={sib.colorLabel}
              className={`group relative inline-flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-200 active:scale-90 ${
                isActive
                  ? "ring-2 ring-[#9B1B30] ring-offset-2"
                  : "ring-1 ring-[#1A1410]/15 hover:ring-2 hover:ring-[#1A1410]/40 hover:ring-offset-2"
              }`}
            >
              <span
                className="block h-7 w-7 rounded-full border border-black/10 shadow-sm"
                style={{ backgroundColor: swatch }}
              />
              {isActive && (
                <span className="pointer-events-none absolute -bottom-5 text-[10px] font-semibold uppercase tracking-wider text-[#9B1B30]">
                  Selected
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
};

// Memoised: when a sibling is clicked the whole route segment refetches, but
// the parent ProductView still re-renders with the same `siblings` array. memo
// keeps the swatches from re-rendering unless the actual props (currentId,
// currentColor, siblings reference) change.
export default memo(ColorVariantSwatches);
