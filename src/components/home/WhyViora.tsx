import { QUALITY_IMAGES } from "@/data/homeAssets";
import AssetImage from "./AssetImage";

// Same material and care facts as the FAQ (src/components/FaqSection.tsx).
const POINTS = [
  { title: "Premium brass base", body: "A solid, comfortable base that holds its shape — not flimsy alloy." },
  { title: "Rhodium-plated shine", body: "A bright finish that lasts 1.5–2 years with simple care." },
  { title: "Original glass stones", body: "Diamond-style sparkle in rich, true-to-photo colours." },
  { title: "Hand-checked before dispatch", body: "Every piece is inspected, then packed safely in Kolkata." },
];

/** Specific, visible reasons to trust the quality. */
const WhyViora = ({ productImages }: { productImages: string[] }) => (
  <section aria-labelledby="why-viora" className="bg-platinum px-4 py-10 md:px-6 md:py-14 lg:px-8">
    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Why Viora</p>
    <h2 id="why-viora" className="mt-1 font-playfair text-3xl font-bold text-primary md:text-4xl">
      Made to look expensive. Priced to wear often.
    </h2>
    <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
      {POINTS.map((point, i) => (
        <li key={point.title} className="bg-white">
          <div className="relative aspect-square w-full bg-platinum">
            <AssetImage
              image={QUALITY_IMAGES[i]}
              fallbackSrc={productImages.length ? productImages[(i + 1) % productImages.length] : undefined}
              sizes="(min-width: 768px) 25vw, 50vw"
            />
          </div>
          <div className="p-3 md:p-4">
            <p className="font-semibold leading-tight text-primary">{point.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-600 md:text-sm">{point.body}</p>
          </div>
        </li>
      ))}
    </ul>
  </section>
);

export default WhyViora;
