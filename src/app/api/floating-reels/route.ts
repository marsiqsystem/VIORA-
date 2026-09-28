// GET /api/floating-reels -> [{ src, poster, hasAudio, slug, productName, price, prepaidPrice }]
// The site-wide floating reel's videos with live prices; designs that are out
// of stock are left out. Loaded once the bubble is about to show.

import { NextResponse } from "next/server";
import { wixClientServer } from "@/lib/wixClientServer";
import { baseNameOf, dedupeDesigns, isInStock, sellingPrice } from "@/lib/catalogue";
import { PREPAID_DISCOUNT } from "@/lib/checkoutPricing";
import { FLOATING_REELS, reelKey } from "@/data/productReels";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const wixClient = await wixClientServer();
    const res = await wixClient.products.queryProducts().limit(100).find();
    const byKey = new Map(
      dedupeDesigns(res.items || [])
        .filter(isInStock)
        .map((p) => [reelKey(baseNameOf(p)), p])
    );
    const all = res.items || [];
    const colourOf = (name?: string | null) => (name || "").split(" - ")[1]?.trim().toLowerCase();
    const reels = FLOATING_REELS.flatMap(({ key, reel, colour }) => {
      // The colour she's wearing in the video, if in stock; else the design's usual pick.
      const worn = colour
        ? all.find((q) => isInStock(q) && reelKey(baseNameOf(q)) === key && colourOf(q.name) === colour)
        : undefined;
      const p = worn || byKey.get(key);
      if (!p?.slug) return [];
      const price = sellingPrice(p);
      return [
        {
          ...reel,
          slug: p.slug,
          productName: baseNameOf(p),
          price,
          prepaidPrice: Math.max(0, price - PREPAID_DISCOUNT),
        },
      ];
    });
    return NextResponse.json(reels, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    });
  } catch (err) {
    console.error("[floating-reels] failed:", err);
    return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });
  }
}
