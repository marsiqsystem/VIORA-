// GET /api/nav-categories -> [{ slug, label, count, image }]
// Category tiles for the site menu, loaded the first time the menu opens.

import { NextResponse } from "next/server";
import { loadShopData } from "@/lib/shopData";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await loadShopData({});
  const categories = data.categories.map(({ slug, label, count, image }) => ({
    slug,
    label: slug === "all-products" ? "All Jewellery" : label,
    count,
    image: image || null,
  }));
  return NextResponse.json(categories, {
    headers: {
      "Cache-Control": data.failed ? "no-store" : "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
