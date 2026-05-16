
import ProductList from "@/components/ProductList";
import Skeleton from "@/components/Skeleton";
import { wixClientServer } from "@/lib/wixClientServer";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";

// Category slug to ID mapping from Wix backend
const CATEGORY_IDS: Record<string, string> = {
  "frocks": "804ca82b-9cbf-62df-a893-5d397f864623",
  "soft-toys": "7ba60ccf-20fd-646a-32ac-8c4d2d94883d",
  "watches": "8e03096d-efa5-3d08-6aff-a0d5545f5644",
  "fragrances": "9cebfdb2-8f4e-3541-222b-4c759623b790",
};

const ListPage = async ({ searchParams }: { searchParams: any }) => {
  const wixClient = await wixClientServer();
  const categorySlug = searchParams.cat || "all-products";

  // Get category ID from mapping, or fetch by slug
  let categoryId = CATEGORY_IDS[categorySlug];
  let categoryName = categorySlug.replace(/-/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());

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
            src="/all products.png"
            alt="All Products Banner"
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
          {/* Light gradient overlay to ensure text is readable on various backgrounds */}
          <div className="absolute inset-0 bg-gradient-to-r from-platinum/80 via-platinum/50 to-transparent" />
        </div>

        <div className="container-responsive relative z-10 w-full">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-gray-600 mb-6">
            <Link href="/" className="hover:text-primary transition-colors">
              Home
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-primary font-medium">Shop</span>
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
              Gift-ready
            </span>
            <h2 className="text-2xl md:text-3xl font-playfair font-bold text-white mb-2">
              Curated Jewellery For Every Cart
            </h2>
            <p className="text-white/80 text-sm md:text-base">
              Browse polished picks with secure checkout and premium packaging.
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



        {/* Results Info */}
        <div className="flex items-center justify-between mt-10 mb-6">
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
