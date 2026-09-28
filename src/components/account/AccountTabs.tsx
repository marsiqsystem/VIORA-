"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWishlistStore } from "@/hooks/useWishlistStore";

const TABS = [
  { href: "/account/orders", label: "Orders" },
  { href: "/wishlist", label: "Wishlist" },
  { href: "/profile", label: "Profile & rewards" },
];

/** The account area's tab row — same on every account page, phone and desktop. */
const AccountTabs = () => {
  const pathname = usePathname() || "";
  const wishlistCount = useWishlistStore((s) => s.items.length);

  return (
    <nav aria-label="Account" className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold ${
              active ? "border-primary bg-primary text-white" : "border-gray-300 bg-white text-primary hover:border-accent"
            }`}
          >
            {tab.label}
            {tab.href === "/wishlist" && wishlistCount > 0 && (
              <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-white/20" : "bg-accent text-white"}`}>{wishlistCount}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
};

export default AccountTabs;
