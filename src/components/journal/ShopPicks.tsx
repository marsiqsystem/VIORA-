import Image from "next/image";
import Link from "next/link";
import { pickProducts, type CatalogItem } from "@/lib/journalCatalog";

/**
 * In-article product block for Journal posts.
 *
 * This is the bridge between the Journal (where the organic traffic lands) and
 * the shop (where it converts). It exists for two reasons:
 *
 *  1. Readers finishing a styling guide are at peak intent and previously had
 *     nowhere to go but a generic /list link.
 *  2. Internal links pass PageRank. The Journal is the part of the site Google
 *     currently trusts; product pages need that trust to rank.
 *
 * Rendered fully on the server so the <a href> is in the HTML — a client-side
 * fetch would be invisible to crawlers and defeat the point.
 *
 * Used from MDX, e.g.:
 *   <ShopPicks collection="gifting" maxPrice={500} heading="Gifts under ₹500" />
 */
/**
 * Every prop is a plain string, deliberately.
 *
 * next-mdx-remote v6 defaults to `blockJS: true`, which runs the
 * `removeJavaScriptExpressions` remark plugin and silently strips *all* JSX
 * expression attributes — `maxPrice={500}` and `slugs={["a","b"]}` arrive as
 * `undefined`, with no error. That guard is worth keeping (it's what stops MDX
 * from becoming an arbitrary-code-execution surface), so the props are strings
 * and we parse them here instead of disabling it.
 *
 * If you add a prop to this component, make it a string.
 */
export interface ShopPicksProps {
  catalog: CatalogItem[];
  heading?: string;
  intro?: string;
  /** Collection slug to draw from, e.g. "gifting". */
  collection?: string;
  /** Comma-separated preferred product slugs, tried first. */
  slugs?: string;
  /** Price ceiling in rupees, e.g. "500". */
  maxPrice?: string;
  /** How many cards to show. Defaults to 3. */
  limit?: string;
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toSlugList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ShopPicks({
  catalog,
  heading = "Shop this guide",
  intro,
  slugs,
  collection,
  maxPrice,
  limit,
}: ShopPicksProps) {
  const picks = pickProducts(catalog, {
    slugs: toSlugList(slugs),
    collection,
    maxPrice: toNumber(maxPrice),
    limit: toNumber(limit) ?? 3,
  });

  const browseHref = collection ? `/list?cat=${collection}` : "/list";

  // Wix is down, or every pick sold out at once. Still give the reader (and the
  // crawler) a real link rather than an empty box.
  if (picks.length === 0) {
    return (
      <p className="my-8 text-base leading-relaxed text-gray-700">
        <Link
          href={browseHref}
          className="text-accent underline underline-offset-2 hover:no-underline"
        >
          Browse the full Viora Jewel collection →
        </Link>
      </p>
    );
  }

  return (
    <aside className="my-10 rounded-2xl border border-silver-light bg-platinum p-5 md:p-7">
      <h2 className="font-playfair text-xl md:text-2xl font-bold text-primary">
        {heading}
      </h2>
      {intro && (
        <p className="mt-2 text-sm md:text-base leading-relaxed text-gray-600">
          {intro}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
        {picks.map((p) => {
          const hasDiscount = p.fullPrice > p.price;
          return (
            <Link
              key={p.slug}
              href={`/${p.slug}`}
              className="group block rounded-xl bg-white border border-silver-light overflow-hidden shadow-sm hover:shadow-premium transition-all"
            >
              <div className="relative aspect-square">
                <Image
                  src={p.image}
                  alt={`${p.displayName}${p.colour ? ` in ${p.colour}` : ""} — Viora Jewel`}
                  fill
                  sizes="(max-width: 768px) 45vw, 30vw"
                  quality={70}
                  loading="lazy"
                  className="object-cover transition-transform duration-300 md:group-hover:scale-[1.03]"
                />
              </div>
              <div className="p-3">
                <h3 className="font-medium text-xs md:text-sm text-gray-800 group-hover:text-accent transition-colors line-clamp-2">
                  {p.displayName}
                </h3>
                {p.colour && (
                  <p className="mt-0.5 text-[11px] text-gray-500">{p.colour}</p>
                )}
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="font-bold text-sm md:text-base text-accent">
                    ₹{p.price}
                  </span>
                  {hasDiscount && (
                    <span className="text-[11px] text-gray-400 line-through">
                      ₹{p.fullPrice}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-5 text-sm">
        <Link
          href={browseHref}
          className="text-accent underline underline-offset-2 hover:no-underline"
        >
          See more →
        </Link>
      </p>
    </aside>
  );
}
