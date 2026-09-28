import Link from "next/link";
import { BRAND_NOTE } from "@/data/homeAssets";
import AssetImage from "./AssetImage";

/** A real place and real people behind the brand. */
const BrandNote = () => (
  <section aria-labelledby="brand-note" className="bg-white">
    <div className="grid md:grid-cols-2">
      <div className="relative aspect-[4/5] w-full md:aspect-auto md:min-h-[520px]">
        <AssetImage image={BRAND_NOTE.image} sizes="(min-width: 768px) 50vw, 100vw" />
      </div>
      <div className="flex flex-col justify-center px-4 py-10 md:px-12 lg:px-16">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Our story</p>
        <h2 id="brand-note" className="mt-1 font-playfair text-3xl font-bold text-primary md:text-4xl">
          {BRAND_NOTE.heading}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-gray-700">{BRAND_NOTE.story}</p>
        <Link
          href="/about"
          className="mt-6 self-start border-b-2 border-accent pb-0.5 text-sm font-bold uppercase tracking-wider text-accent"
        >
          More about us
        </Link>
      </div>
    </div>
  </section>
);

export default BrandNote;
