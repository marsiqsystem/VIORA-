import ProductView from "@/components/ProductView";
import { wixClientServer } from "@/lib/wixClientServer";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ColorSibling } from "@/components/ColorVariantSwatches";
import BackButton from "@/components/BackButton";

const splitBaseAndColor = (name: string): { base: string; color: string } => {
  const idx = name.indexOf(" - ");
  if (idx === -1) return { base: name.trim(), color: "" };
  return {
    base: name.slice(0, idx).trim(),
    color: name.slice(idx + 3).trim(),
  };
};

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
      {/* Breadcrumb with Back button */}
      <div className="container-responsive py-4 border-b border-gray-100">
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

      {/* Product Section */}
      <div className="container-responsive py-8 lg:py-12">
        <ProductView
          product={product}
          colorSiblings={siblings}
          currentColor={currentColor}
          displayName={baseName}
          isBestSeller={isBestSeller}
        />
      </div>
    </div>
  );
};

export default SinglePage;

