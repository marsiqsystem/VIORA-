import Image from "next/image";
import Link from "next/link";
import { CATEGORY_LINKS } from "@/lib/categories";

const CATEGORY_IMAGES: Record<string, string> = {
  "all-products": "/all-products-optimized.jpg",
  "best-sellers": "/productsdesk-optimized.jpg",
  "ear-rings": "/new-arrival-optimized.jpg",
  "fresh-from-viora": "/new-arrival-optimized.jpg",
  "wedding-reception": "/banner-optimized.jpg",
  "office-parties": "/hero-optimized.jpg",
  gifting: "/all-products-optimized.jpg",
  "new-arrivals": "/new-arrival-optimized.jpg",
};

const FALLBACK_IMAGE = "/all-products-optimized.jpg";

type Props = {
  activeSlug?: string;
  imageBySlug?: Record<string, string>;
};

const CategoryStrip = ({ activeSlug, imageBySlug = {} }: Props) => {
  return (
    <div className="w-full overflow-hidden">
      <div className="flex w-full justify-between gap-4 overflow-x-auto pb-2 sm:gap-5 lg:gap-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORY_LINKS.map((category) => {
          const active = activeSlug === category.slug;

          return (
            <Link
              key={category.slug}
              href={`/list?cat=${category.slug}#product-grid`}
              aria-label={category.label}
              className="group flex w-[84px] flex-shrink-0 flex-col items-center gap-2 sm:w-[98px] lg:w-[112px]"
            >
              <div
                className={`relative h-[84px] w-[84px] flex-shrink-0 overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 sm:h-[98px] sm:w-[98px] lg:h-[112px] lg:w-[112px] ${
                  active
                    ? "border-accent ring-2 ring-accent/30"
                    : "border-silver-light group-hover:border-accent group-hover:shadow-md"
                }`}
              >
                <Image
                  src={
                    imageBySlug[category.slug] ||
                    CATEGORY_IMAGES[category.slug] ||
                    FALLBACK_IMAGE
                  }
                  alt={category.label}
                  fill
                  loading="eager"
                  sizes="(min-width: 1024px) 112px, (min-width: 640px) 98px, 84px"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <span
                className={`line-clamp-2 min-h-[32px] text-center text-xs font-medium leading-tight sm:text-sm ${
                  active ? "text-accent" : "text-primary"
                }`}
              >
                {category.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default CategoryStrip;
