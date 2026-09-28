import type { Metadata } from "next";
import { permanentRedirect, redirect } from "next/navigation";
import ShopView from "@/components/shop/ShopView";
import { CATEGORY_LABELS } from "@/lib/categories";
import { PREPAID_DISCOUNT } from "@/lib/checkoutPricing";
import { loadShopData } from "@/lib/shopData";

type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Old category slugs still linked from WhatsApp templates, ads and search results. */
const LEGACY_CATEGORIES: Record<string, { to: string; permanent: boolean }> = {
  "fresh-from-viora": { to: "new-arrivals", permanent: true },
  "rakhi-special": { to: "all-products", permanent: true },
  gifting: { to: "all-products", permanent: true },
};

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const cat = one(searchParams.cat) || "all-products";
  const q = one(searchParams.q);
  const name =
    cat === "all-products"
      ? "Jewellery"
      : CATEGORY_LABELS[cat] || cat.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  return {
    title: q ? `Search: ${q}` : cat === "all-products" ? "Shop Necklace Sets, Earrings & Gifts" : name,
    description: `Shop ${name.toLowerCase()} from Viora Jewel — diamond-style necklace sets and earrings. FREE delivery + ₹${PREPAID_DISCOUNT} off when you pay online, COD available.`,
    alternates: { canonical: cat === "all-products" ? "/list" : `/list?cat=${cat}` },
    // Search result pages are thin duplicates of category pages.
    ...(q ? { robots: { index: false, follow: true } } : {}),
  };
}

const ListPage = async ({ searchParams }: { searchParams: SearchParams }) => {
  const cat = one(searchParams.cat);
  const legacySearch = one(searchParams.search);

  if ((cat && LEGACY_CATEGORIES[cat]) || (legacySearch && !one(searchParams.q))) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      const v = one(value);
      if (v && key !== "search" && key !== "page") params.set(key, v);
    }
    if (cat && LEGACY_CATEGORIES[cat]) params.set("cat", LEGACY_CATEGORIES[cat].to);
    if (legacySearch) params.set("q", legacySearch);
    const target = `/list?${params.toString()}`;
    if (cat && LEGACY_CATEGORIES[cat]?.permanent) permanentRedirect(target);
    redirect(target);
  }

  const data = await loadShopData({
    cat,
    q: one(searchParams.q),
    sort: one(searchParams.sort),
    under: one(searchParams.under),
    over: one(searchParams.over),
  });

  return <ShopView data={data} />;
};

export default ListPage;
