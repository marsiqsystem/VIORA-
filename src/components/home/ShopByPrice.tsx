import Link from "next/link";
import { PRICE_BANDS } from "@/data/homeAssets";
import type { PriceBandSummary } from "@/lib/homeData";
import AssetImage from "./AssetImage";

// Fill the desktop row whatever the number of bands (only bands with 2+ designs show).
const DESKTOP_COLS: Record<number, string> = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4" };

/** Shop by price — takes "can I afford it?" off the table. */
const ShopByPrice = ({ bands }: { bands: PriceBandSummary[] }) => {
  if (bands.length === 0) return null;
  return (
    <section aria-labelledby="shop-by-price" className="bg-white px-4 py-10 md:px-6 md:py-14 lg:px-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Shop by budget</p>
      <h2 id="shop-by-price" className="mt-1 font-playfair text-3xl font-bold text-primary md:text-4xl">
        Find your look at your price
      </h2>
      <ul className={`mt-5 grid grid-cols-2 gap-3 md:gap-6 ${DESKTOP_COLS[bands.length] || "md:grid-cols-4"}`}>
        {bands.map((band) => {
          const slot = PRICE_BANDS.find((b) => b.key === band.key)!;
          return (
            <li key={band.key}>
              <Link href={band.href} className="group relative block aspect-[4/5] overflow-hidden bg-platinum">
                <AssetImage
                  image={slot.image}
                  fallbackSrc={band.image}
                  sizes="(min-width: 768px) 25vw, 50vw"
                  className="transition-transform duration-500 group-hover:scale-105"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-3 text-white md:p-4">
                  <span className="block font-playfair text-2xl font-bold leading-tight md:text-3xl">{band.label}</span>
                  <span className="mt-0.5 block text-xs font-medium text-white/85">
                    {band.count} designs · from ₹{band.fromPrice}
                  </span>
                  <span className="mt-2 inline-block border-b border-white text-[11px] font-bold uppercase tracking-wider">
                    Shop now
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default ShopByPrice;
