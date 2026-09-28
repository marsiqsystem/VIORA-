import Image from "next/image";
import Link from "next/link";
import { PREPAID_DISCOUNT } from "@/lib/checkoutPricing";
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
 *   <ShopPicks collection="gifting" maxPrice="500" heading="Gifts under ₹500" />
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

/** Collections with no shop page of their own (Gifting is hidden from the shop). */
const COLLECTION_PAGES: Record<string, string> = { gifting: "/list#product-grid" };

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

  const browseHref = collection
    ? COLLECTION_PAGES[collection] || `/list?cat=${collection}#product-grid`
    : "/list";

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
    <aside className="my-10 border border-silver-light bg-platinum p-5 md:p-7">
      <h2 className="font-playfair text-xl font-bold text-primary md:text-2xl">{heading}</h2>
      {intro && <p className="mt-2 text-sm leading-relaxed text-gray-600 md:text-base">{intro}</p>}

      {/* Phones: a swipe row (no orphan card); md+: a 3-up grid. */}
      <ul className="scrollbar-hide -mx-5 mt-5 flex snap-x scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 md:mx-0 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0">
        {picks.map((p) => {
          const hasDiscount = p.fullPrice > p.price;
          return (
            <li key={p.slug} className="w-[46%] shrink-0 snap-start md:w-auto">
              <Link
                href={`/${p.slug}`}
                className="group block h-full overflow-hidden border border-silver-light bg-white transition-shadow hover:shadow-premium"
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
                  <h3 className="font-inter line-clamp-2 text-xs font-medium text-gray-800 transition-colors group-hover:text-accent md:text-sm">
                    {p.displayName}
                  </h3>
                  {p.colour && <p className="mt-0.5 text-[11px] text-gray-500">{p.colour}</p>}
                  <p className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="text-sm font-bold text-accent md:text-base">₹{p.price}</span>
                    {hasDiscount && <span className="text-[11px] text-gray-400 line-through">₹{p.fullPrice}</span>}
                  </p>
                  {p.price > PREPAID_DISCOUNT && (
                    <p className="mt-0.5 text-[11px] font-medium text-green-700">
                      ₹{p.price - PREPAID_DISCOUNT} paying online
                    </p>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="mt-5 text-sm">
        <Link href={browseHref} className="font-semibold text-accent underline underline-offset-2 hover:no-underline">
          See more →
        </Link>
      </p>
    </aside>
  );
}
