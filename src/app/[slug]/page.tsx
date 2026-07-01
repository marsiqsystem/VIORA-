import type { Metadata } from "next";
import ProductView from "@/components/ProductView";
import { wixClientServer } from "@/lib/wixClientServer";
import { fetchProductReviews } from "@/lib/reviewsActions";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ColorSibling } from "@/components/ColorVariantSwatches";
import BackButton from "@/components/BackButton";
import ProductJsonLd from "@/components/ProductJsonLd";
import RelatedProducts from "@/components/RelatedProducts";
import { Suspense } from "react";

// Canonical site origin — kept in sync with sitemap.ts / robots.ts.
const BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.viorajewel.in"
).replace(/\/$/, "");

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

function descriptionToPlainText(html: string): string {
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
      ? descriptionToPlainText(product.description)
      : "";
    const description =
      rawDescription.length > 30
        ? rawDescription.slice(0, 160)
        : `${baseName} from Viora Jewel — affordable Indian fashion jewellery with free shipping across India and an easy 48-hour exchange on damaged or incorrect items.`;

    const ogImage =
      product.media?.mainMedia?.image?.url ||
      product.media?.items?.[0]?.image?.url;

    return {
      title: name,
      description,
      alternates: { canonical: `/${product.slug || params.slug}` },
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
      matched.push({
        id: p._id!,
        slug: p.slug || "",
        name: p.name || "",
        colorLabel: color || currentColor || "Original",
      });
    }

    // Always include the current product (in case it wasn't returned by either query for any reason).
    if (!matched.some((s) => s.id === product._id)) {
      matched.unshift({
        id: product._id!,
        slug: product.slug || params.slug,
        name: product.name || "",
        colorLabel: currentColor || "Original",
      });
    }

    siblings = matched;
  }

  // Fetch real Wix Reviews for this product (server-side).
  const initialReviews = product._id
    ? await fetchProductReviews(product._id)
    : [];

  // Check if product belongs to the "featured" (bestseller) collection.
  let isBestSeller = false;
  try {
    const collections = await wixClient.collections.queryCollections().find();
    const bestSellerCollection = collections.items.find(
      (c) =>
        c.slug === "featured" ||
        c.slug === "best-sellers" ||
        (c.name || "").toLowerCase().includes("best seller")
    );
    if (bestSellerCollection && product.collectionIds) {
      isBestSeller = product.collectionIds.includes(bestSellerCollection._id!);
    }
  } catch (e) {
    // Non-critical — badge just won't show
  }

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
          used to push the price below the fold in the ad preview. */}
      <div className="container-responsive py-1 border-b border-gray-100">
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

      {/* Product Section — no top padding for the same "keep the price above the fold in ads" reason */}
      <div className="container-responsive pb-8 lg:pb-12">
        <ProductView
          product={product}
          colorSiblings={siblings}
          currentColor={currentColor}
          displayName={baseName}
          isBestSeller={isBestSeller}
          initialReviews={initialReviews}
        />
      </div>

      {/* Related products — same collection, current product excluded */}
      <Suspense fallback={null}>
        <RelatedProducts
          currentProductId={product._id || ""}
          currentName={product.name || ""}
          collectionIds={product.collectionIds || []}
        />
      </Suspense>
    </div>
  );
};

export default SinglePage;

