import type { Metadata } from "next";
import type { products } from "@wix/stores";
import ProductView from "@/components/ProductView";
import { wixClientServer } from "@/lib/wixClientServer";
import { fetchProductReviews } from "@/lib/reviewsActions";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ColorSibling } from "@/components/ColorVariantSwatches";
import type { PairItem } from "@/components/PairItWith";
import type { ProductReel } from "@/components/ProductReels";
import { PRODUCT_REELS, reelKey } from "@/data/productReels";
import BackButton from "@/components/BackButton";
import ProductJsonLd from "@/components/ProductJsonLd";
import RelatedProducts from "@/components/RelatedProducts";
import { loadReviewSnippets } from "@/lib/reviewSnippets";
import { isDuplicateSlug } from "@/lib/duplicateProducts";
import { htmlToText } from "@/lib/htmlToText";
import { Suspense } from "react";
import { baseKeyOf, bestSellerRank, dedupeDesigns, isInStock, sellingPrice } from "@/lib/catalogue";
import { getRecentOrderCounts } from "@/lib/popularity";

// Canonical site origin — kept in sync with sitemap.ts / robots.ts.
const BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.viorajewel.in"
).replace(/\/$/, "");

const PAIR_WITH_LIMIT = 6;

// Wix collections that describe an occasion, keyed by collection slug.
const OCCASION_LABELS: Record<string, string> = {
  weddingreception: "Weddings & receptions",
  "office-parties": "Office parties",
};

type WixServerClient = Awaited<ReturnType<typeof wixClientServer>>;

type Merchandising = {
  isBestSeller: boolean;
  occasions: string[];
  pairWith: PairItem[];
};

// Year-ahead ISO date used for Offer.priceValidUntil so Google stops warning
// about missing validity windows. Refreshed on each request (page is dynamic).
function oneYearFromNow(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

const splitBaseAndColor = (name: string): { base: string; color: string } => {
  const idx = name.indexOf(" - ");
  if (idx === -1) return { base: name.trim(), color: "" };
  return {
    base: name.slice(0, idx).trim(),
    color: name.slice(idx + 3).trim(),
  };
};

/**
 * Product videos uploaded to Wix media, for the reels row. Colour variants are
 * separate Wix products, so a reel filmed on any colour is shown on all of them
 * (the current product's own videos first).
 */
function extractReels(group: products.Product[]): ProductReel[] {
  const seen = new Set<string>();
  const reels: ProductReel[] = [];
  for (const p of group) {
    for (const m of p.media?.items || []) {
      if (m.mediaType !== "video" || !m._id || seen.has(m._id)) continue;
      const files = (m.video?.files || []).filter((f) => !!f.url);
      if (files.length === 0) continue;
      // ~720p is sharp on phones without the 1080p download.
      const best = [...files].sort(
        (a, b) => Math.abs((a.height || 0) - 720) - Math.abs((b.height || 0) - 720)
      )[0];
      seen.add(m._id);
      reels.push({ id: m._id, src: best.url!, poster: m.thumbnail?.url || undefined });
    }
  }
  return reels;
}

/**
 * Best-seller badge, occasion labels and the "Add to your
 * order" row (one card per design). Non-critical: on any Wix error the page
 * renders without them.
 */
async function loadMerchandising(
  wixClient: WixServerClient,
  product: products.Product,
  baseName: string
): Promise<Merchandising> {
  try {
    const collections = await wixClient.collections.queryCollections().find();
    const inCollection = (id?: string | null) =>
      !!id && (product.collectionIds || []).includes(id);

    const bestSellers = collections.items.find(
      (c) =>
        c.slug === "featured" ||
        c.slug === "best-sellers" ||
        (c.name || "").toLowerCase().includes("best seller")
    );
    const earrings = collections.items.find(
      (c) => c.slug === "ear-rings" || /ear\s?-?rings?/i.test(c.name || "")
    );

    const isBestSeller = inCollection(bestSellers?._id);
    const isEarrings = inCollection(earrings?._id);
    const occasions = collections.items
      .filter((c) => !!c.slug && !!OCCASION_LABELS[c.slug] && inCollection(c._id))
      .map((c) => OCCASION_LABELS[c.slug!]);

    // "Add to your order": sets already come with earrings, so a set page offers
    // other sets (a second look) and an earrings page offers sets, then other
    // earrings. Ranked by real orders so the row leads with proven designs.
    const [res, orderCounts] = await Promise.all([
      wixClient.products.queryProducts().limit(100).find(),
      getRecentOrderCounts(),
    ]);
    const isEarringsProduct = (p: products.Product) =>
      !!earrings?._id && (p.collectionIds || []).includes(earrings._id);
    const ownBase = baseName.toLowerCase();
    const candidates = dedupeDesigns(
      res.items.filter(
        (p) =>
          p._id !== product._id &&
          p.visible !== false &&
          isInStock(p) &&
          !(p.stock?.trackInventory === true && (p.stock?.quantity ?? 0) < 1) &&
          baseKeyOf(p) !== ownBase &&
          (isEarrings || !isEarringsProduct(p))
      )
    ).filter(isInStock);

    const picked = candidates
      .sort(
        (a, b) =>
          Number(isEarringsProduct(a)) - Number(isEarringsProduct(b)) ||
          (orderCounts[baseKeyOf(b)] || 0) - (orderCounts[baseKeyOf(a)] || 0) ||
          bestSellerRank(a) - bestSellerRank(b) ||
          sellingPrice(a) - sellingPrice(b)
      )
      .slice(0, PAIR_WITH_LIMIT);

    const pairWith: PairItem[] = picked.map((p) => {
      const options = p.productOptions || [];
      const selected: Record<string, string> = {};
      for (const o of options) {
        const choice = o.choices?.[0]?.description;
        if (o.name && choice) selected[o.name] = choice;
      }
      const price = p.price?.discountedPrice || p.price?.price || 0;
      const fullPrice = p.price?.price || 0;
      return {
        id: p._id!,
        slug: p.slug || "",
        name: splitBaseAndColor(p.name || "").base || p.name || "",
        image: p.media?.mainMedia?.image?.url || undefined,
        price,
        compareAt: fullPrice > price ? fullPrice : undefined,
        variantId: options.length ? p.variants?.[0]?._id || undefined : undefined,
        options: Object.keys(selected).length ? selected : undefined,
        // Single-choice options (e.g. one Color) can be added directly.
        quickAdd: options.every((o) => (o.choices?.length || 0) <= 1),
      };
    });

    return { isBestSeller, occasions, pairWith };
  } catch (err) {
    console.error("[product merchandising] failed:", err);
    return { isBestSeller: false, occasions: [], pairWith: [] };
  }
}

/**
 * Per-product Open Graph + Twitter metadata so each product URL renders its
 * own preview (product photo + product name + product description) when
 * shared on Instagram, WhatsApp, Facebook, X, LinkedIn, etc. Without this,
 * every product link inherits the global homepage banner — which the
 * marketing team reported as broken-looking previews on Instagram.
 */
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  try {
    const wixClient = await wixClientServer();
    const products = await wixClient.products
      .queryProducts()
      .eq("slug", params.slug)
      .find();
    const product = products.items[0];
    if (!product) {
      return { title: "Product not found" };
    }

    const name = (product.name || "Viora Jewel piece").trim();
    const baseName = splitBaseAndColor(name).base || name;
    const url = `${BASE_URL}/${product.slug || params.slug}`;

    const rawDescription = product.description
      ? htmlToText(product.description)
      : "";
    const description =
      rawDescription.length > 30
        ? rawDescription.slice(0, 160)
        : `${baseName} from Viora Jewel — affordable Indian fashion jewellery with free delivery when you pay online, cash on delivery across India and a 48-hour exchange on damaged or incorrect items.`;

    const ogImage =
      product.media?.mainMedia?.image?.url ||
      product.media?.items?.[0]?.image?.url;

    const slug = product.slug || params.slug;

    return {
      title: name,
      description,
      alternates: { canonical: `/${slug}` },
      // A Wix duplicate clone is the same item as the original, so let crawlers
      // read it and follow its links but keep it out of the index — otherwise
      // two identical URLs compete and Google picks the winner for us. Dropping
      // it from the sitemap is not enough on its own: Google already knows these
      // URLs, and only a noindex on the page itself will remove them.
      ...(isDuplicateSlug(slug)
        ? { robots: { index: false, follow: true } }
        : {}),
      openGraph: {
        type: "website",
        title: `${name} | Viora Jewel`,
        description,
        url,
        siteName: "Viora Jewel",
        locale: "en_IN",
        ...(ogImage
          ? {
              images: [
                {
                  url: ogImage,
                  alt: name,
                },
              ],
            }
          : {}),
      },
      twitter: {
        card: "summary_large_image",
        title: `${name} | Viora Jewel`,
        description,
        ...(ogImage ? { images: [ogImage] } : {}),
      },
    };
  } catch (err) {
    console.error("[product metadata] failed:", err);
    return {};
  }
}

const SinglePage = async ({ params }: { params: { slug: string } }) => {
  const wixClient = await wixClientServer();

  const products = await wixClient.products
    .queryProducts()
    .eq("slug", params.slug)
    .find();

  if (!products.items[0]) {
    return notFound();
  }

  const product = products.items[0];

  // Sibling lookup: find every product whose name starts with the same Base Name.
  // Convention: "[Base Name] - [Color]" — siblings share the base and differ by color.
  const { base: baseName, color: currentColor } = splitBaseAndColor(product.name || "");
  const normalizedBase = baseName.toLowerCase();

  let siblings: ColorSibling[] = [];
  // Full Wix products for the other colours — their videos feed the reels row.
  const siblingProducts: products.Product[] = [];

  if (baseName) {
    // Wix `startsWith` is case-sensitive. Run two queries (raw + lowercased) and
    // merge, so we catch siblings regardless of how the merchant capitalised them.
    const [rawRes, lowerRes] = await Promise.all([
      wixClient.products
        .queryProducts()
        .startsWith("name", baseName)
        .limit(100)
        .find(),
      wixClient.products
        .queryProducts()
        .startsWith("name", baseName.toLowerCase())
        .limit(100)
        .find(),
    ]);

    const byId = new Map<string, (typeof rawRes.items)[number]>();
    for (const p of [...rawRes.items, ...lowerRes.items]) {
      if (p._id) byId.set(p._id, p);
    }

    const matched: ColorSibling[] = [];
    for (const p of Array.from(byId.values())) {
      const { base, color } = splitBaseAndColor(p.name || "");
      if (base.toLowerCase() !== normalizedBase) continue;
      // Skip non-siblings that share a prefix but no color suffix and aren't the current product.
      if (!color && p._id !== product._id) continue;
      if (p._id !== product._id) siblingProducts.push(p);
      matched.push({
        id: p._id!,
        slug: p.slug || "",
        name: p.name || "",
        colorLabel: color || currentColor || "Original",
        image: p.media?.mainMedia?.image?.url || undefined,
      });
    }

    // Always include the current product (in case it wasn't returned by either query for any reason).
    if (!matched.some((s) => s.id === product._id)) {
      matched.unshift({
        id: product._id!,
        slug: product.slug || params.slug,
        name: product.name || "",
        colorLabel: currentColor || "Original",
        image: product.media?.mainMedia?.image?.url || undefined,
      });
    }

    siblings = matched;
  }

  // Reels shipped in public/reels first, then any videos uploaded to Wix media.
  const reels: ProductReel[] = [
    ...(PRODUCT_REELS[reelKey(baseName)] || []).map((r) => ({ id: r.src, hasAudio: false, ...r })),
    ...extractReels([product, ...siblingProducts]),
  ];

  // Real Wix Reviews, review quotes for the top of the page and merchandising
  // (badge, occasions, "Add to your order"), in parallel.
  const [initialReviews, reviewSnippets, { isBestSeller, occasions, pairWith }] = await Promise.all([
    product._id
      ? fetchProductReviews(product._id)
      : Promise.resolve([] as Awaited<ReturnType<typeof fetchProductReviews>>),
    product._id ? loadReviewSnippets(product._id, baseName) : Promise.resolve([]),
    loadMerchandising(wixClient, product, baseName),
  ]);

  // ---- Structured data (JSON-LD) inputs, derived from the Wix product ----
  const productImages =
    product.media?.items
      ?.map((item) => item.image?.url)
      .filter((url): url is string => Boolean(url)) ?? [];
  if (productImages.length === 0 && product.media?.mainMedia?.image?.url) {
    productImages.push(product.media.mainMedia.image.url);
  }

  // Mirror ProductView's sold-out logic: only out of stock when Wix says so.
  const isOutOfStock =
    product.stock?.inStock === false ||
    (product.stock?.trackInventory === true &&
      (product.stock?.quantity ?? 0) < 1);

  // Aggregate rating from the reviews already fetched above.
  const reviewCount = initialReviews.length;
  const ratingValue =
    reviewCount > 0
      ? initialReviews.reduce((sum, r) => sum + (r.rating || 0), 0) /
        reviewCount
      : 0;

  // Server-side trace so missing/empty groups are easy to debug from the Next.js server log.
  console.log("[ColorGroup]", {
    slug: params.slug,
    name: product.name,
    baseName,
    currentColor,
    siblingCount: siblings.length,
    siblings: siblings.map((s) => `${s.name} [${s.colorLabel}]`),
  });

  return (
    <div className="min-h-screen bg-white">
      {/* SEO: Product + BreadcrumbList structured data for Google + AI Rich Results */}
      <ProductJsonLd
        name={product.name || baseName}
        description={product.description || ""}
        images={productImages}
        price={product.price?.discountedPrice || product.price?.price || 0}
        currency={product.price?.currency || "INR"}
        availability={!isOutOfStock}
        url={`${BASE_URL}/${product.slug || params.slug}`}
        sku={product.sku || product._id || undefined}
        priceValidUntil={oneYearFromNow()}
        aggregateRating={{ ratingValue, reviewCount }}
        breadcrumbs={[
          { name: "Home", url: `${BASE_URL}/` },
          { name: "Shop", url: `${BASE_URL}/list` },
          {
            name: baseName || product.name || "Product",
            url: `${BASE_URL}/${product.slug || params.slug}`,
          },
        ]}
      />

      {/* Breadcrumb with Back button — tight top/bottom padding so the product
          image sits high on the page. This matters for ads: platforms crop
          product-page screenshots from the top, and any extra top whitespace
          used to push the price below the fold in the ad preview. Side padding
          is deliberately slim (not container-responsive) so the page uses the
          full width. */}
      <div className="px-4 py-1 md:px-6 lg:px-8 border-b border-gray-100">
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <BackButton className="-ml-2" />
          <Link href="/" className="hover:text-primary transition-colors">
            Home
          </Link>
          <span className="text-gray-300">/</span>
          <Link href="/list" className="hover:text-primary transition-colors">
            Shop
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-primary font-medium line-clamp-1">
            {baseName}
          </span>
        </nav>
      </div>

      {/* Product Section — no top padding on mobile for the same "keep the price above the fold in ads" reason */}
      <div className="px-4 pb-8 md:px-6 lg:px-8 lg:pb-12 lg:pt-6">
        <ProductView
          product={product}
          colorSiblings={siblings}
          currentColor={currentColor}
          displayName={baseName}
          isBestSeller={isBestSeller}
          initialReviews={initialReviews}
          pairWith={pairWith}
          reels={reels}
          occasions={occasions}
          reviewSnippets={reviewSnippets}
        />
      </div>

      {/* Related products — same collection, current product excluded */}
      <Suspense fallback={null}>
        <RelatedProducts
          currentProductId={product._id || ""}
          currentName={product.name || ""}
          currentColor={currentColor}
          collectionIds={product.collectionIds || []}
        />
      </Suspense>
    </div>
  );
};

export default SinglePage;
