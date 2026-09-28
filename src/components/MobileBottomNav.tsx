"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCartStore } from "@/hooks/useCartStore";
import { useCommerceUi } from "@/hooks/useCommerceUi";
import { useWixClient } from "@/hooks/useWixClient";
import { useWishlistStore } from "@/hooks/useWishlistStore";

type Tab = {
  id: string;
  label: string;
  active: boolean;
  href?: string;
  onTap?: () => void;
  icon: (active: boolean) => JSX.Element;
  badge?: number;
};

/** Internal tools share the site layout but aren't shopping pages. */
const HIDDEN_ON = ["/dashboard", "/inbox", "/broadcast", "/order-fix"];

const svg = (d: string, filled = false) => (
  <svg className="h-6 w-6" fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const MobileBottomNav = () => {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { counter } = useCartStore();
  const openDrawer = useCommerceUi((s) => s.openDrawer);
  const drawerOpen = useCommerceUi((s) => s.drawerOpen);
  const wishlistCount = useWishlistStore((s) => s.items.length);
  const wixClient = useWixClient();
  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  const wishlistActive = pathname.startsWith("/wishlist");
  const accountActive = ["/profile", "/account", "/login", "/orders", "/track"].some((p) => pathname.startsWith(p));

  const tabs: Tab[] = [
    {
      id: "home",
      label: "Home",
      href: "/",
      active: pathname === "/" && !drawerOpen,
      icon: (a) => svg("M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9.5z", a),
    },
    {
      id: "shop",
      label: "Shop",
      href: "/list",
      active: !drawerOpen && ["/list", "/products", "/new-arrivals"].some((p) => pathname.startsWith(p)),
      icon: () => svg("M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v6H4zM14 15h6v6h-6z"),
    },
    {
      id: "wishlist",
      label: "Wishlist",
      href: "/wishlist",
      active: wishlistActive && !drawerOpen,
      icon: (a) =>
        svg("M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z", a),
      badge: wishlistCount,
    },
    {
      id: "account",
      label: "Account",
      onTap: () => router.push(wixClient.auth.loggedIn() ? "/profile" : "/login"),
      active: !drawerOpen && accountActive,
      icon: (a) => svg("M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z", a),
    },
    {
      id: "bag",
      label: "Bag",
      onTap: () => openDrawer(),
      active: pathname.startsWith("/cart") || drawerOpen,
      icon: () => svg("M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"),
      badge: counter,
    },
  ];

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="fixed bottom-0 left-0 z-50 block w-full border-t border-[#1A1410]/10 bg-white shadow-lg md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {tabs.map((t) => {
          const content = (
            <span className={`relative flex min-h-[60px] flex-col items-center justify-center gap-0.5 px-1 py-2 ${t.active ? "text-[#9B1B30]" : "text-[#1A1410]/75"}`}>
              <span className="relative">
                {t.icon(t.active)}
                {!!t.badge && t.badge > 0 && (
                  <span className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#9B1B30] px-1 text-[10px] font-semibold text-white">
                    {t.badge}
                  </span>
                )}
              </span>
              <span className="text-[11px] font-medium tracking-wide">{t.label}</span>
              <span
                aria-hidden
                className={`absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-b-full bg-[#9B1B30] transition-opacity ${t.active ? "opacity-100" : "opacity-0"}`}
              />
            </span>
          );
          return (
            <li key={t.id} className="flex">
              {t.href ? (
                <Link href={t.href} className="flex-1" aria-current={t.active ? "page" : undefined}>
                  {content}
                </Link>
              ) : (
                <button type="button" onClick={t.onTap} className="flex-1" aria-current={t.active ? "page" : undefined}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default MobileBottomNav;
