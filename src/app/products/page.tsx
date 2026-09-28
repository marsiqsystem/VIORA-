import type { Metadata } from "next";
import ShopView from "@/components/shop/ShopView";
import { PREPAID_DISCOUNT } from "@/lib/checkoutPricing";
import { loadShopData } from "@/lib/shopData";

export const metadata: Metadata = {
  title: "Artificial Jewellery Online — Necklace Sets, Earrings & Gifts",
  description: `Shop the full Viora Jewel collection online — artificial & fashion jewellery, necklace sets for women, stone necklace sets, earrings and bridal jewellery sets. FREE delivery + ₹${PREPAID_DISCOUNT} off when you pay online, COD available.`,
  alternates: { canonical: "/products" },
  openGraph: {
    title: "Artificial Jewellery Online — Necklace Sets & Earrings | Viora Jewel",
    description:
      "Browse every Viora Jewel piece — artificial & fashion jewellery sets, necklace sets and earrings, with COD available across India.",
    url: "/products",
  },
};

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const ProductsPage = async ({ searchParams }: { searchParams: SearchParams }) => {
  const data = await loadShopData({
    sort: one(searchParams.sort),
    under: one(searchParams.under),
    over: one(searchParams.over),
  });
  return <ShopView data={data} basePath="/products" />;
};

export default ProductsPage;
