import { NextResponse } from "next/server";
import { wixClientServer } from "@/lib/wixClientServer";

/**
 * Google Shopping product feed for Viora Jewel.
 *
 * Generates an RSS 2.0 feed with Google's Shopping namespace from the live
 * Wix product catalogue. Google Merchant Center subscribes to this URL and
 * automatically imports every visible product, instead of relying on slow
 * organic crawl detection (which usually picks up only a handful of products
 * over weeks).
 *
 * To wire up:
 *   GMC → Products → Add products → Add product feed
 *   → name: "Viora Jewel Live Feed"
 *   → schedule: daily fetch
 *   → URL: https://www.viorajewel.in/feed.xml
 *
 * Spec: https://support.google.com/merchants/answer/7052112
 */

export const revalidate = 3600; // Cache for 1 hour at the edge.

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.viorajewel.in"
).replace(/\/$/, "");

// Ultimate fallback image for products with no usable media in Wix. Using the
// brand logo keeps the item in the feed instead of dropping it — Google would
// rather review a placeholder than miss the product entirely.
const FALLBACK_IMAGE = `${SITE_URL}/logo%20compressed.png`;

/**
 * Wix Stores stores product media in several possible shapes depending on how
 * the product was uploaded (single image, gallery, video-first, variant-only).
 * Try every known path before giving up so we don't silently drop products
 * that actually have images.
 */
function extractProductImages(product: any): {
  main: string | undefined;
  additional: string[];
} {
  const candidates: string[] = [];

  // media.mainMedia — primary
  const mm = product?.media?.mainMedia;
  if (mm?.image?.url) candidates.push(mm.image.url);
  if (mm?.thumbnail?.url) candidates.push(mm.thumbnail.url);
  if (mm?.video?.posters?.[0]?.url) candidates.push(mm.video.posters[0].url);

  // media.items[] — gallery
  const items = product?.media?.items;
  if (Array.isArray(items)) {
    for (const it of items) {
      if (it?.image?.url) candidates.push(it.image.url);
      else if (it?.thumbnail?.url) candidates.push(it.thumbnail.url);
      else if (it?.video?.posters?.[0]?.url)
        candidates.push(it.video.posters[0].url);
    }
  }

  // Variant images (some catalogs store images per variant only)
  const variants = product?.variants;
  if (Array.isArray(variants)) {
    for (const v of variants) {
      if (v?.media?.mainMedia?.image?.url)
        candidates.push(v.media.mainMedia.image.url);
    }
  }

  // Dedupe while preserving order.
  const seen = new Set<string>();
  const unique = candidates.filter((u) => {
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  return {
    main: unique[0],
    additional: unique.slice(1, 11),
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET() {
  try {
    const wixClient = await wixClientServer();
    const itemNodes: string[] = [];

    // Diagnostic counters surface in Vercel logs so we know exactly why a
    // product is being dropped from the feed.
    const stats = {
      totalSeen: 0,
      keptWithImage: 0,
      keptWithFallback: 0,
      skippedHidden: 0,
      skippedNoSlug: 0,
      skippedNoId: 0,
    };

    let query = await wixClient.products.queryProducts().limit(100).find();

    while (true) {
      for (const p of query.items) {
        stats.totalSeen += 1;

        if (p.visible === false) {
          stats.skippedHidden += 1;
          continue;
        }
        if (!p.slug) {
          stats.skippedNoSlug += 1;
          console.warn(`[feed.xml] skipping product with no slug: ${p._id}`);
          continue;
        }

        const id = p.sku || p._id;
        if (!id) {
          stats.skippedNoId += 1;
          continue;
        }

        const name = (p.name || "").trim() || "Viora Jewel piece";
        const link = `${SITE_URL}/${p.slug}`;

        // Robust multi-path image lookup; fall back to brand logo if Wix
        // returns no usable media at all (keeps the product in the feed
        // rather than silently dropping it).
        const { main, additional } = extractProductImages(p);
        const mainImage = main ?? FALLBACK_IMAGE;
        if (main) stats.keptWithImage += 1;
        else {
          stats.keptWithFallback += 1;
          console.warn(
            `[feed.xml] no media found for ${p.slug} (${p._id}) — using fallback`
          );
        }

        // Build description — strip HTML, fall back to a sane default.
        const rawDescription = p.description ? toPlainText(p.description) : "";
        const description =
          rawDescription.length >= 50
            ? rawDescription
            : `${name} from Viora Jewel — affordable Indian fashion jewellery with free shipping across India and a 48-hour exchange on damaged or incorrect items.`;

        const price =
          p.price?.discountedPrice && p.price.discountedPrice > 0
            ? p.price.discountedPrice
            : p.price?.price ?? 0;
        const currency = p.price?.currency || "INR";

        // Mirror the in-stock logic from the product page.
        const inStock =
          p.stock?.inStock !== false &&
          !(
            p.stock?.trackInventory === true &&
            (p.stock?.quantity ?? 1) < 1
          );

        const additionalImageNodes = additional
          .map(
            (u) =>
              `      <g:additional_image_link>${escapeXml(u)}</g:additional_image_link>`
          )
          .join("\n");

        // Sale price (separate from base price in Google's spec).
        const hasSale =
          typeof p.price?.discountedPrice === "number" &&
          typeof p.price?.price === "number" &&
          p.price.discountedPrice < p.price.price;
        const salePriceNode = hasSale
          ? `\n      <g:sale_price>${p.price!.discountedPrice} ${currency}</g:sale_price>`
          : "";
        const basePrice = hasSale ? p.price!.price : price;

        itemNodes.push(
          `    <item>
      <g:id>${escapeXml(String(id))}</g:id>
      <g:title>${escapeXml(name.slice(0, 150))}</g:title>
      <g:description>${escapeXml(description.slice(0, 5000))}</g:description>
      <g:link>${escapeXml(link)}</g:link>
      <g:image_link>${escapeXml(mainImage)}</g:image_link>${
        additionalImageNodes ? `\n${additionalImageNodes}` : ""
      }
      <g:condition>new</g:condition>
      <g:availability>${inStock ? "in_stock" : "out_of_stock"}</g:availability>
      <g:price>${basePrice} ${currency}</g:price>${salePriceNode}
      <g:brand>Viora Jewel</g:brand>
      <g:mpn>${escapeXml(String(id))}</g:mpn>
      <g:google_product_category>Apparel &amp; Accessories &gt; Jewelry</g:google_product_category>
      <g:product_type>Fashion Jewellery</g:product_type>
      <g:age_group>adult</g:age_group>
      <g:gender>female</g:gender>
      <g:shipping>
        <g:country>IN</g:country>
        <g:service>Standard</g:service>
        <g:price>0 INR</g:price>
        <g:min_handling_time>1</g:min_handling_time>
        <g:max_handling_time>2</g:max_handling_time>
        <g:min_transit_time>5</g:min_transit_time>
        <g:max_transit_time>7</g:max_transit_time>
      </g:shipping>
    </item>`
        );
      }

      if (!query.hasNext()) break;
      query = await query.next();
    }

    console.log("[feed.xml] generation stats:", stats, "items emitted:", itemNodes.length);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Viora Jewel — Fashion Jewellery</title>
    <link>${SITE_URL}</link>
    <description>Affordable Indian fashion jewellery, earrings and gifting pieces mostly under ₹649. Free shipping across India. 48-hour exchange on damaged or incorrect items.</description>
${itemNodes.join("\n")}
  </channel>
</rss>`;

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("[feed.xml] Failed to build product feed:", err);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Viora Jewel</title><description>Feed temporarily unavailable</description></channel></rss>`,
      {
        status: 500,
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      }
    );
  }
}
