import Link from "next/link";
import { CATEGORY_TILES } from "@/data/homeAssets";
import AssetImage from "./AssetImage";

type Props = {
  collectionImages: Record<string, string>;
  productImage?: string;
};

/** Shop by category — round tiles, swipeable on phones. */
const HomeCategories = ({ collectionImages, productImage }: Props) => (
  <section aria-labelledby="home-categories" className="bg-platinum px-4 pt-6 md:px-6 md:pt-10 lg:px-8">
    <h2 id="home-categories" className="sr-only">
      Shop by category
    </h2>
    <ul className="scrollbar-hide -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:justify-between md:px-0">
      {CATEGORY_TILES.map((tile, i) => (
        <li key={tile.slug} className="shrink-0 snap-start">
          <Link href={`/list?cat=${tile.slug}#product-grid`} className="group flex w-[76px] flex-col items-center gap-2 md:w-[120px]">
            <span className="relative block h-[76px] w-[76px] overflow-hidden rounded-full border-2 border-white shadow-sm ring-1 ring-silver-light transition group-hover:ring-accent md:h-[120px] md:w-[120px]">
              <AssetImage
                image={tile.image}
                fallbackSrc={tile.fallback === "product" ? productImage : collectionImages[tile.slug] || productImage}
                sizes="(min-width: 768px) 120px, 76px"
                priority={i < 5}
                className="transition-transform duration-300 group-hover:scale-105"
              />
            </span>
            <span className="text-center text-xs font-semibold leading-tight text-primary md:text-sm">{tile.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  </section>
);

export default HomeCategories;
