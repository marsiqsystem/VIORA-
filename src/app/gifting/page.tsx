import Link from "next/link";
import ProductList from "@/components/ProductList";
import Skeleton from "@/components/Skeleton";
import { Suspense } from "react";
import { WIX_COLLECTION_IDS } from "@/lib/categories";
import BackButton from "@/components/BackButton";

const trustItems: [string, string][] = [
  ["Trusted Quality", "Premium craftsmanship in every piece"],
  ["Secure checkout", "Protected payments every time"],
  ["Fast shipping", "Free delivery on all orders"],
  ["Easy Exchange", "48-hour support on eligible pieces"],
];

export const metadata = {
  title: "Gifting | Viora Jewels",
  description: "Thoughtful jewellery gifts from Viora Jewels.",
};

const GiftingPage = () => {
  return (
    <div className="bg-platinum text-primary">
      {/* RELOCATED: Jewellery Gifts That Feel Personal — now at the top of /gifting */}
      <section className="px-4 pt-10 pb-14 md:px-8 md:pt-14 md:pb-18 lg:px-12 xl:px-16 2xl:px-24">
        <div className="mb-6 flex items-center gap-2">
          <BackButton className="bg-white shadow-sm" />
          <span className="text-sm font-medium text-gray-500">Back</span>
        </div>
        <div className="grid overflow-hidden rounded-lg border border-silver-light bg-platinum md:grid-cols-2">
          <div className="p-8 md:p-12 lg:p-16">
            <span className="inline-block rounded-full bg-platinum-warm px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              Gift assist
            </span>
            <h1 className="mt-4 text-3xl md:text-5xl font-playfair font-bold leading-tight text-primary">
              Jewellery Gifts That Feel Personal
            </h1>
            <p className="mt-4 max-w-lg text-gray-600 leading-relaxed">
              Highlighting thoughtful gifts, secure checkout, and quick delivery
              keeps the buying path clear for shoppers who are ready now.
            </p>
            <Link
              href="/list?cat=gifting#product-grid"
              className="mt-8 inline-flex rounded-full bg-accent px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary"
            >
              Shop Gifting
            </Link>
          </div>
          <div className="bg-silver-light p-8 md:p-12 lg:p-16">
            <div className="h-full rounded-lg border border-silver bg-platinum p-6">
              <p className="font-playfair text-3xl font-bold text-primary">
                The Viora Gift Promise
              </p>
              <div className="mt-8 space-y-5">
                {trustItems.map(([title, desc]) => (
                  <div key={title} className="border-b border-silver-light pb-5 last:border-0">
                    <h3 className="font-semibold text-primary">{title}</h3>
                    <p className="mt-1 text-sm text-gray-600">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-10 md:py-14 px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <span className="inline-block rounded-full bg-[#f3ca7e] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              CURATED FOR GIFTING
            </span>
            <h2 className="mt-3 text-3xl md:text-4xl font-playfair font-bold text-primary">
              Pieces they&apos;ll remember
            </h2>
            <p className="mt-2 max-w-xl text-sm md:text-base text-gray-800">
              Discover polished picks for thoughtful gifting.
            </p>
          </div>
          <Link
            href="/list?cat=gifting#product-grid"
            className="hidden sm:inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary"
          >
            Shop gifting
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
        <Suspense fallback={<Skeleton />}>
          <ProductList
            categoryId={WIX_COLLECTION_IDS.gifting}
            limit={8}
          />
        </Suspense>
      </section>
    </div>
  );
};

export default GiftingPage;
