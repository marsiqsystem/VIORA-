import { wixClientServer } from "@/lib/wixClientServer";
import Image from "next/image";
import Link from "next/link";
import React from "react";

// Categories to exclude from display
const EXCLUDED_SLUGS = ["all-products", "featured", "new-arrivals"];

const Categories = async () => {
  const wixClient = await wixClientServer();
  const cats = await wixClient.collections.queryCollections().find();

  // Filter out excluded categories
  const filteredCats = cats.items.filter(
    (item) => !EXCLUDED_SLUGS.includes(item.slug || "")
  );

  return (
    <div className="px-2 md:px-4 lg:px-8 xl:px-12 2xl:px-16">
      {/* Mobile & tablet: horizontal scroll */}
      <div
        className="
          flex gap-4 md:gap-6
          overflow-x-auto overflow-y-hidden flex-nowrap
          scroll-smooth hide-scrollbar
          snap-x snap-mandatory
          lg:hidden
        "
      >
        {filteredCats.map((item) => (
          <Link
            href={`/list?cat=${item.slug}`}
            key={item._id}
            className="flex-shrink-0 snap-start w-3/4 sm:w-1/2 md:w-1/3 transition-transform duration-300 ease-in-out hover:scale-[1.02]"
          >
            <div className="relative w-full overflow-hidden group rounded-xl shadow-premium hover:shadow-premium-hover transition-shadow duration-300 h-full">
              <div className="relative bg-silver-light w-full h-64 md:h-80">
                <Image
                  src={item.media?.mainMedia?.image?.url || "/cat.png"}
                  alt={item.name || "Category"}
                  fill
                  sizes="40vw"
                  className="object-cover rounded-xl transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>

              {/* Always visible category name at bottom */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4">
                <h3 className="text-white text-lg md:text-xl font-playfair font-semibold">
                  {item.name}
                </h3>
              </div>

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <span className="bg-white text-primary px-4 py-2 rounded-lg font-medium text-sm transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                  Shop Now
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Desktop & large: grid layout */}
      <div className="hidden lg:grid w-full gap-6 grid-cols-2 xl:grid-cols-4">
        {filteredCats.map((item) => (
          <Link
            href={`/list?cat=${item.slug}`}
            key={item._id}
            className="block transition-transform duration-300 ease-in-out hover:scale-[1.02]"
          >
            <div className="relative w-full overflow-hidden group rounded-xl shadow-premium hover:shadow-premium-hover transition-shadow duration-300 h-full">
              <div className="relative bg-silver-light w-full h-80 xl:h-96">
                <Image
                  src={item.media?.mainMedia?.image?.url || "/cat.png"}
                  alt={item.name || "Category"}
                  fill
                  sizes="25vw"
                  className="object-cover rounded-xl transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>

              {/* Always visible category name at bottom */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4">
                <h3 className="text-white text-lg xl:text-xl font-playfair font-semibold">
                  {item.name}
                </h3>
              </div>

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <span className="bg-white text-primary px-4 py-2 rounded-lg font-medium text-sm transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                  Shop Now
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Categories;
