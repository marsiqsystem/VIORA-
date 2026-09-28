"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCartStore } from "@/hooks/useCartStore";
import { useCommerceUi } from "@/hooks/useCommerceUi";
import { useWixClient } from "@/hooks/useWixClient";

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
  const wixClient = useWixClient();
  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  const trackActive = ["/track", "/orders", "/account/orders"].some((p) => pathname.startsWith(p));
  const accountActive = !trackActive && ["/profile", "/account", "/login", "/wishlist"].some((p) => pathname.startsWith(p));

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
      // Order number + phone, no login needed; signed-in shoppers also find
      // their orders under Account. (Wishlist is in the menu and Account.)
      id: "track",
      label: "Track Order",
      href: "/track",
      active: trackActive && !drawerOpen,
      icon: () => svg("M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"),
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
              <span className="whitespace-nowrap text-[11px] font-medium tracking-wide">{t.label}</span>
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
