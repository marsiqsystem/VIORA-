import Link from "next/link";
import type { products } from "@wix/stores";
import ProductCard from "@/components/ProductCard";

type Props = {
  id: string;
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  viewAllHref: string;
  items: products.Product[];
  tone?: "white" | "platinum";
  /** One full desktop row — a half-empty second row looks unfinished. */
  limit?: number;
};

/** A product row: swipeable on phones, a 4-up grid on desktop. */
const ProductRail = ({ id, eyebrow, title, subtitle, viewAllHref, items, tone = "platinum", limit = 4 }: Props) => {
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby={id}
      className={`px-4 py-10 md:px-6 md:py-14 lg:px-8 ${tone === "white" ? "bg-white" : "bg-platinum"}`}
    >
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">{eyebrow}</p>}
          <h2 id={id} className="mt-1 font-playfair text-3xl font-bold text-primary md:text-4xl">
            {title}
          </h2>
          {subtitle && <div className="mt-1">{subtitle}</div>}
        </div>
        <Link href={viewAllHref} className="shrink-0 text-sm font-semibold text-accent underline-offset-4 hover:underline">
          View all →
        </Link>
      </div>
      <ul className="scrollbar-hide -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:gap-6 md:overflow-visible md:px-0">
        {items.slice(0, limit).map((product, index) => (
          <li key={product._id} className="w-[46%] shrink-0 snap-start md:w-auto">
            <ProductCard product={product} index={index} />
          </li>
        ))}
      </ul>
    </section>
  );
};

export default ProductRail;
