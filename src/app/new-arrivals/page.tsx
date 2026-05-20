import ProductList from "@/components/ProductList";
import Skeleton from "@/components/Skeleton";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { WIX_COLLECTION_IDS } from "@/lib/categories";
import BackButton from "@/components/BackButton";

const NewArrivalsPage = ({ searchParams }: { searchParams: any }) => {
  return (
    <div className="min-h-screen bg-platinum">
      {/* Hero Banner */}
      <div className="relative py-16 md:py-28 overflow-hidden min-h-[300px] flex items-center">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/new-arrival-optimized.jpg"
            alt="New Arrivals Banner"
            fill
            sizes="100vw"
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
            <span>/</span>
            <span className="text-gray-900 font-medium">New Arrivals</span>
          </nav>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-playfair font-bold text-primary mb-4">
            New Arrivals
          </h1>
          <p className="text-gray-600 max-w-xl text-lg">
            Discover the latest elegant pieces added to our collection.
          </p>
        </div>
      </div>

      <div className="container-responsive py-12 md:py-16">
        {/* Results Info */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl md:text-2xl font-playfair font-bold text-primary">
            Freshly Added
          </h2>
        </div>

        {/* Products */}
        <Suspense fallback={<Skeleton />}>
          <ProductList
            categoryId={WIX_COLLECTION_IDS.newArrivals}
            searchParams={searchParams}
          />
        </Suspense>
      </div>
    </div>
  );
};

export default NewArrivalsPage;
