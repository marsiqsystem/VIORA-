"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";

type Tab = {
  id: string;
  label: string;
  match: (path: string) => boolean;
  href?: string;
  onTap?: () => void;
  icon: (active: boolean) => JSX.Element;
  showBadge?: boolean;
};

const MobileBottomNav = () => {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { counter } = useCartStore();
  const wixClient = useWixClient();
  const isLoggedIn = wixClient.auth.loggedIn();

  const tabs: Tab[] = [
    {
      id: "home",
      label: "Home",
      href: "/",
      match: (p) => p === "/",
      icon: (active) => (
        <svg
          className="w-6 h-6"
          fill={active ? "currentColor" : "none"}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.6}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10" />
        </svg>
      ),
    },
    {
      id: "search",
      label: "Search",
      href: "/list",
      match: (p) => p.startsWith("/list"),
      icon: () => (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
    },
    {
      id: "wishlist",
      label: "Wishlist",
      href: "/profile?tab=wishlist",
      match: (p) => p.startsWith("/profile") && p.includes("wishlist"),
      icon: (active) => (
        <svg
          className="w-6 h-6"
          fill={active ? "currentColor" : "none"}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.6}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ),
    },
    {
      id: "profile",
      label: "Profile",
      onTap: () => router.push(isLoggedIn ? "/profile" : "/login"),
      match: (p) => p.startsWith("/profile") || p.startsWith("/account") || p === "/login",
      icon: (active) => (
        <svg
          className="w-6 h-6"
          fill={active ? "currentColor" : "none"}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.6}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      id: "cart",
      label: "Cart",
      href: "/cart",
      match: (p) => p.startsWith("/cart"),
      icon: () => (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      ),
      showBadge: true,
    },
  ];

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="fixed bottom-0 left-0 w-full z-50 bg-white border-t border-[#1A1410]/10 shadow-lg block md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const tone = active ? "text-[#9B1B30]" : "text-[#1A1410]/75";
          const content = (
            <div className={`flex flex-col items-center justify-center gap-0.5 px-2 py-2 min-h-[64px] min-w-[44px] relative ${tone}`}>
              <span className="relative">
                {tab.icon(active)}
                {tab.showBadge && counter > 0 && (
                  <span className="absolute -top-1.5 -right-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#9B1B30] px-1 text-[10px] font-semibold text-white">
                    {counter}
                  </span>
                )}
              </span>
              <span className="text-[11px] font-medium tracking-wide">
                {tab.label}
              </span>
              <span
                aria-hidden
                className={`absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-b-full bg-[#9B1B30] transition-opacity ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
            </div>
          );

          return (
            <li key={tab.id} className="flex">
              {tab.href ? (
                <Link href={tab.href} className="flex-1" aria-current={active ? "page" : undefined}>
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={tab.onTap}
                  className="flex-1 outline-none"
                  aria-current={active ? "page" : undefined}
                >
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
