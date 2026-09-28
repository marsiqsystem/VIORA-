import Image from "next/image";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import SearchBar from "@/components/SearchBar";
import ProductRail from "@/components/home/ProductRail";
import TrustStrip from "@/components/home/TrustStrip";
import { baseNameOf, sellingPrice } from "@/lib/catalogue";
import type { ShopData } from "@/lib/shopData";
import type { ShopSort } from "@/lib/shopSorts";
import OfferLadderTile from "./OfferLadderTile";
import SortSelect from "./SortSelect";
import ListViewTracker from "./ListViewTracker";

type Props = {
  data: ShopData;
  /** Path the page lives at; /products and /new-arrivals keep their own URL for sort + price. */
  basePath?: string;
};

const ShopView = ({ data, basePath = "/list" }: Props) => {
  const defaultSort: ShopSort = data.categorySlug === "new-arrivals" ? "new" : "popular";
  const ownsCategory = basePath === "/list";

  const hrefWith = (changes: Partial<Record<"sort" | "under" | "over" | "q", string | number | undefined>>) => {
    const params = new URLSearchParams();
    if (ownsCategory && data.categorySlug !== "all-products") params.set("cat", data.categorySlug);
    const current = {
      q: data.query || undefined,
      sort: data.sort !== defaultSort ? data.sort : undefined,
      under: data.under || undefined,
      over: data.over || undefined,
    };
    for (const [key, value] of Object.entries({ ...current, ...changes })) {
      if (value !== undefined && value !== "" && value !== 0) params.set(key, String(value));
    }
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  const priceActive = data.under > 0 || data.over > 0;
  const activeChip = data.priceChips.find((c) => c.active);
  const customPriceLabel =
    priceActive && !activeChip
      ? data.over && data.under
        ? `₹${data.over + 1}–₹${data.under}`
        : data.under
          ? `₹${data.under} & under`
          : `Over ₹${data.over}`
      : null;

  const count = data.items.length;
  const inStockCount = data.items.filter((p) => p.stock?.inStock !== false && p.stock?.quantity !== 0).length;
  const searchMissed = !!data.query && data.totalBeforePrice === 0;

  const heading = data.query ? `Results for “${data.query}”` : data.title;
  const summary = data.failed
    ? "We couldn't load the collection just now — please refresh in a moment."
    : data.query
      ? `${count} ${count === 1 ? "design" : "designs"} found`
      : `${data.intro}`;

  return (
    <div className="min-h-screen bg-platinum text-primary">
      <section id="product-grid" className="scroll-mt-14 px-4 pt-4 md:scroll-mt-20 md:px-6 md:pt-8 lg:px-8">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-gray-500">
          <Link href="/" className="hover:text-accent">
            Home
          </Link>
          <span aria-hidden="true">/</span>
          <Link href="/list" className="hover:text-accent">
            Shop
          </Link>
          {(data.query || data.categorySlug !== "all-products") && (
            <>
              <span aria-hidden="true">/</span>
              <span className="font-medium text-primary">{data.query ? "Search" : data.title}</span>
            </>
          )}
        </nav>
        <h1 className="mt-2 font-playfair text-[28px] font-bold leading-tight md:text-4xl">{heading}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {summary}
          {!data.failed && !data.query && data.totalBeforePrice > 0 && (
            <span className="whitespace-nowrap font-medium text-primary">
              {" "}
              · {data.totalBeforePrice} designs{data.fromPrice ? ` from ₹${data.fromPrice}` : ""}
            </span>
          )}
          {data.query && (
            <Link href={ownsCategory ? "/list" : basePath} className="ml-2 font-semibold text-accent underline-offset-4 hover:underline">
              Clear search
            </Link>
          )}
        </p>
        {ownsCategory && (
          <div className="mt-3 md:max-w-md">
            <SearchBar variant="mobile" defaultValue={data.query} />
          </div>
        )}
      </section>

      {/* Categories — swipeable pills with a real product photo */}
      {data.categories.length > 0 && (
        <nav aria-label="Categories" className="mt-4">
          <ul className="scrollbar-hide flex gap-2 overflow-x-auto px-4 pb-1 md:px-6 lg:px-8">
            {data.categories.map((c) => (
              <li key={c.slug} className="shrink-0">
                <Link
                  href={c.slug === "all-products" ? "/list" : `/list?cat=${c.slug}`}
                  aria-current={c.active ? "page" : undefined}
                  className={`flex h-10 items-center gap-2 rounded-full border pl-1 pr-3.5 text-[13px] font-semibold transition-colors ${
                    c.active
                      ? "border-primary bg-primary text-white"
                      : "border-silver-light bg-white text-primary hover:border-accent"
                  }`}
                >
                  <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-platinum">
                    {c.image && <Image src={c.image} alt="" fill sizes="32px" className="object-cover" />}
                  </span>
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Sort + price — sticks under the header while browsing */}
      {!data.failed && data.totalBeforePrice > 0 && (
        <div className="sticky top-14 z-30 mt-3 border-y border-silver-light bg-platinum/95 backdrop-blur md:top-20">
          <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto px-4 py-2 md:px-6 lg:px-8">
            <SortSelect value={data.sort} defaultSort={defaultSort} />
            <span className="h-5 w-px shrink-0 bg-gray-300" aria-hidden="true" />
            {data.priceChips.map((chip) => (
              <Link
                key={chip.key}
                href={chip.active ? hrefWith({ under: undefined, over: undefined }) : hrefWith({ under: chip.under, over: chip.over })}
                scroll={false}
                aria-pressed={chip.active}
                className={`flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold ${
                  chip.active ? "border-accent bg-accent text-white" : "border-gray-300 bg-white text-primary hover:border-accent"
                }`}
              >
                {chip.label}
                {chip.active ? <span aria-hidden="true">✕</span> : <span className="font-normal text-gray-500">({chip.count})</span>}
              </Link>
            ))}
            {customPriceLabel && (
              <Link
                href={hrefWith({ under: undefined, over: undefined })}
                scroll={false}
                className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-accent bg-accent px-3 text-[13px] font-semibold text-white"
              >
                {customPriceLabel} <span aria-hidden="true">✕</span>
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="px-4 pb-10 pt-4 md:px-6 md:pb-14 md:pt-6 lg:px-8">
        {priceActive && count > 0 && (
          <p className="mb-3 text-xs text-gray-500">
            Showing {count} of {data.totalBeforePrice} designs ·{" "}
            <Link href={hrefWith({ under: undefined, over: undefined })} scroll={false} className="font-semibold text-accent">
              Show all prices
            </Link>
          </p>
        )}

        {count > 0 ? (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-4 lg:gap-8">
            {data.items.map((product, index) => (
              <FragmentWithLadder key={product._id} index={index} enabled={inStockCount >= 6}>
                <li>
                  <ProductCard product={product} index={index} />
                </li>
              </FragmentWithLadder>
            ))}
          </ul>
        ) : (
          !data.failed && (
            <div className="bg-white px-5 py-8 text-center">
              {searchMissed ? (
                <>
                  <h2 className="font-playfair text-2xl font-bold">No designs match “{data.query}”</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
                    Try a simpler word, or jump straight to one of these:
                  </p>
                  <ul className="mt-5 flex flex-wrap justify-center gap-2">
                    {[
                      { href: "/list?cat=best-sellers", label: "Best sellers" },
                      { href: "/list?cat=ear-rings", label: "Earrings" },
                      { href: "/list?cat=wedding-reception", label: "Wedding sets" },
                      { href: "/list?under=499", label: "Under ₹500" },
                    ].map((s) => (
                      <li key={s.href}>
                        <Link href={s.href} className="flex h-10 items-center rounded-full border border-accent px-4 text-sm font-semibold text-accent hover:bg-accent hover:text-white">
                          {s.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <h2 className="font-playfair text-2xl font-bold">Nothing in this price range here yet</h2>
                  <p className="mt-2 text-sm text-gray-600">
                    {data.totalBeforePrice} other {data.totalBeforePrice === 1 ? "design is" : "designs are"} waiting.
                  </p>
                  <Link
                    href={hrefWith({ under: undefined, over: undefined })}
                    scroll={false}
                    className="mt-5 inline-flex h-11 items-center bg-accent px-6 text-sm font-bold uppercase tracking-wide text-white"
                  >
                    Show all prices
                  </Link>
                </>
              )}
            </div>
          )
        )}
      </div>

      {data.rail && data.rail.items.length > 0 && (
        <ProductRail
          id="shop-rail-title"
          eyebrow={data.rail.title === "You may also love" ? "Most bags have two pieces" : undefined}
          title={data.rail.title}
          subtitle={data.rail.subtitle ? <p className="text-sm text-gray-600">{data.rail.subtitle}</p> : undefined}
          viewAllHref="/list?cat=best-sellers"
          items={data.rail.items}
          tone="white"
        />
      )}

      <TrustStrip />

      <ListViewTracker
        listId={data.query ? "search" : data.categorySlug}
        listName={data.query ? `Search: ${data.query}` : data.title}
        query={data.query || undefined}
        items={data.items.map((p) => ({ id: p.slug || p._id || "", name: baseNameOf(p), price: sellingPrice(p) }))}
      />
    </div>
  );
};

/**
 * The ladder row goes after a complete grid row: after 4 cards on phones (2 rows)
 * and desktop (1 row), after 6 on tablets (2 rows of 3).
 */
const FragmentWithLadder = ({ index, enabled, children }: { index: number; enabled: boolean; children: React.ReactNode }) => (
  <>
    {children}
    {enabled && index === 3 && (
      <li className="col-span-2 md:hidden lg:col-span-4 lg:block">
        <OfferLadderTile />
      </li>
    )}
    {enabled && index === 5 && (
      <li className="hidden md:col-span-3 md:block lg:hidden">
        <OfferLadderTile />
      </li>
    )}
  </>
);

export default ShopView;
