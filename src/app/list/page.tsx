
import ProductList from "@/components/ProductList";
import Skeleton from "@/components/Skeleton";
import { wixClientServer } from "@/lib/wixClientServer";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { CATEGORY_IDS, CATEGORY_LABELS, CATEGORY_LINKS } from "@/lib/categories";
import BackButton from "@/components/BackButton";

const ListPage = async ({ searchParams }: { searchParams: any }) => {
  const wixClient = await wixClientServer();
  const categorySlug = searchParams.cat || "all-products";

  // Get category ID from mapping, or fetch by slug
  let categoryId = CATEGORY_IDS[categorySlug];
  let categoryName =
    CATEGORY_LABELS[categorySlug] ||
    categorySlug.replace(/-/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());

  // If not in mapping, try to fetch by slug
  if (!categoryId) {
    try {
      const cat = await wixClient.collections.getCollectionBySlug(categorySlug);
      categoryId = cat.collection?._id || "";
      categoryName = cat.collection?.name || "All Products";
    } catch {
      categoryId = "";
      categoryName = "All Products";
    }
  }

  return (
    <div className="min-h-screen bg-platinum">
      {/* Hero Banner */}
      <div className="relative py-16 md:py-28 overflow-hidden min-h-[300px] flex items-center">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/all-products-optimized.jpg"
            alt="All Products Banner"
            fill
            sizes="100vw"
            quality={70}
            className="object-cover"
            priority
          />
          {/* Light gradient overlay to ensure text is readable on various backgrounds */}
          <div className="absolute inset-0 bg-gradient-to-r from-platinum/80 via-platinum/50 to-transparent" />
        </div>

        <div className="container-responsive relative z-10 w-full">
          <div className="mb-5 flex items-center gap-2">
            <BackButton className="bg-white/80 shadow-sm backdrop-blur" />
            <span className="text-sm font-medium text-gray-600">Back</span>
          </div>
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-gray-600 mb-6">
            <Link href="/" className="hover:text-primary transition-colors">
              Home
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-primary font-medium">Categories</span>
            {searchParams.cat && (
              <>
                <span className="text-gray-400">/</span>
                <span className="text-primary font-medium capitalize">
                  {searchParams.cat.replace(/-/g, " ")}
                </span>
              </>
            )}
          </nav>

          {/* Title */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-playfair font-bold text-primary mb-4">
            {categoryName}
          </h1>
          <p className="text-gray-600 max-w-xl text-lg">
            Discover elegant Viora jewellery for everyday shine, meaningful
            gifts, and occasion-ready styling.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="container-responsive py-8 md:py-12">
        {/* Campaign Banner */}
        <div className="bg-gradient-to-r from-primary to-primary-light rounded-lg p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 mb-10 shadow-premium overflow-hidden relative">
          <div className="flex-1 text-center md:text-left relative z-10">
            <span className="inline-block bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wide">
              New picks
            </span>
            <h2 className="text-2xl md:text-3xl font-playfair font-bold text-white mb-2">
              Curated Jewellery For Every Cart
            </h2>
            <p className="text-white/80 text-sm md:text-base">
              Browse polished picks with secure checkout and fast delivery.
            </p>
          </div>
          <Link
            href="/list?sort=desc+price"
            className="bg-accent text-white px-6 py-3 rounded-full font-semibold hover:bg-silver hover:text-primary transition-all duration-300 flex items-center gap-2 whitespace-nowrap shadow-md relative z-10"
          >
            Shop Now
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </Link>
        </div>



        {/* Results Info — anchor for pagination scroll */}
        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-playfair text-2xl font-bold text-primary">
              Categories
            </h2>
            <Link href="/list#product-grid" className="text-sm font-semibold text-accent hover:text-primary">
              All Jewellery
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORY_LINKS.map((category) => (
              <Link
                href={`/list?cat=${category.slug}#product-grid`}
                key={category.slug}
                className={`rounded-lg border px-5 py-4 font-playfair text-xl font-bold transition-colors ${
                  categorySlug === category.slug
                    ? "border-accent bg-accent text-white"
                    : "border-silver-light bg-white text-primary hover:border-accent hover:text-accent"
                }`}
              >
                {category.label}
              </Link>
            ))}
          </div>
        </section>

        <div id="product-grid" className="flex items-center justify-between mt-10 mb-6 scroll-mt-24">
          <h2 className="text-xl md:text-2xl font-playfair font-bold text-primary">
            {categoryName}
          </h2>
        </div>

        {/* Products */}
        <Suspense fallback={<Skeleton />}>
          <ProductList
            categoryId={categoryId}
            searchParams={searchParams}
          />
        </Suspense>
      </div>
    </div>
  );
};

export default ListPage;
