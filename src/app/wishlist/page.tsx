"use client";

import Image from "next/image";
import Link from "next/link";
import AccountTabs from "@/components/account/AccountTabs";
import { useWishlistStore } from "@/hooks/useWishlistStore";
import { PREPAID_DISCOUNT } from "@/lib/checkoutPricing";

const SITE = "https://www.viorajewel.in";

/**
 * Saved pieces. The list lives in this browser, so no login is needed to see or
 * build it (the old profile tab sent everyone to /login first).
 */
const WishlistPage = () => {
  const items = useWishlistStore((s) => s.items);
  const hydrated = useWishlistStore((s) => s.hasHydrated);
  const remove = useWishlistStore((s) => s.remove);

  // Gift hint: send the list to someone on WhatsApp.
  const shareText = [
    "My Viora wishlist 💛",
    ...items.slice(0, 8).map((it) => `• ${it.name.split(" - ")[0]} — ₹${it.price}: ${SITE}/${it.slug}`),
  ].join("\n");

  return (
    <div className="min-h-[calc(100vh-180px)] bg-platinum px-4 pb-14 pt-5 md:px-6 md:pt-10 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <AccountTabs />
        <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-playfair text-3xl font-bold text-primary">Wishlist</h1>
            <p className="mt-1 text-sm text-gray-600">
              {hydrated && items.length > 0 ? `${items.length} saved on this device` : "Tap ♡ on any piece to save it here."}
            </p>
          </div>
          {hydrated && items.length > 0 && (
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 items-center gap-2 border border-green-600 bg-white px-4 text-sm font-semibold text-green-700 hover:bg-green-50"
            >
              💬 Send my wishlist on WhatsApp
            </a>
          )}
        </div>

        {!hydrated ? (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="aspect-[3/4] animate-pulse bg-white" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-6 bg-white px-5 py-12 text-center">
            <p className="font-playfair text-xl text-primary">Nothing saved yet</p>
            <p className="mt-2 text-sm text-gray-600">Save the pieces you love and come back when you&apos;re ready.</p>
            <Link href="/list?cat=best-sellers" className="mt-5 inline-flex h-11 items-center bg-accent px-6 text-sm font-bold uppercase tracking-wide text-white">
              Browse best sellers
            </Link>
          </div>
        ) : (
          <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
            {items.map((item) => (
              <li key={item.id} className="relative bg-white">
                <Link href={`/${item.slug}`} className="block">
                  <span className="relative block aspect-[3/4] bg-platinum">
                    <Image src={item.image} alt={item.name} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover" />
                  </span>
                  <span className="block p-3">
                    <span className="line-clamp-1 block text-sm font-medium text-primary">{item.name.split(" - ")[0]}</span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="text-sm font-bold text-accent">₹{item.price}</span>
                      {item.fullPrice && item.fullPrice > item.price && (
                        <span className="text-xs text-gray-400 line-through">₹{item.fullPrice}</span>
                      )}
                    </span>
                    <span className="mt-1 block text-[11px] font-medium text-green-700">
                      ₹{Math.max(0, item.price - PREPAID_DISCOUNT)} paying online
                    </span>
                    <span className="mt-3 flex min-h-[40px] items-center justify-center bg-accent text-xs font-bold uppercase tracking-wide text-white">
                      View &amp; buy
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label={`Remove ${item.name.split(" - ")[0]} from wishlist`}
                  className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-500 shadow hover:text-red-600"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default WishlistPage;
