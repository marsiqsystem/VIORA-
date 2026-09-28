import type { Metadata } from "next";
import ShopView from "@/components/shop/ShopView";
import { loadShopData } from "@/lib/shopData";

export const metadata: Metadata = {
  title: "New Arrivals — Latest Jewellery & Gifts",
  description:
    "Discover the newest Viora Jewel arrivals — freshly added necklace sets and earrings. FREE delivery when you pay online, COD available.",
  alternates: { canonical: "/new-arrivals" },
  openGraph: {
    title: "New Arrivals | Viora Jewel",
    description: "The latest additions to the Viora Jewel collection — new necklace sets and earrings.",
    url: "/new-arrivals",
  },
};

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const NewArrivalsPage = async ({ searchParams }: { searchParams: SearchParams }) => {
  const data = await loadShopData({
    cat: "new-arrivals",
    sort: one(searchParams.sort),
    under: one(searchParams.under),
    over: one(searchParams.over),
  });
  return <ShopView data={data} basePath="/new-arrivals" />;
};

export default NewArrivalsPage;
