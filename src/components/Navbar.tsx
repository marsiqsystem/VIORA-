"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import NavDrawer from "./nav/NavDrawer";
import SearchBar from "./SearchBar";

const NavIcons = dynamic(() => import("./NavIcons"), {
  ssr: false,
  loading: () => (
    <div className="hidden items-center gap-1 md:flex">
      <div className="h-11 w-11 rounded-full bg-gray-100 animate-pulse" />
      <div className="h-11 w-11 rounded-full bg-gray-100 animate-pulse" />
      <div className="h-11 w-11 rounded-full bg-gray-100 animate-pulse" />
    </div>
  ),
});

const LINKS = [
  { href: "/list", label: "Shop All", from: "lg" },
  { href: "/list?cat=best-sellers", label: "Best Sellers", from: "lg" },
  { href: "/new-arrivals", label: "New Arrivals", from: "lg" },
  { href: "/list?cat=wedding-reception", label: "Wedding", from: "xl" },
] as const;

/**
 * Three columns (menu + links | logo | icons) so nothing can run into the logo
 * at any width. Phones: 56px bar — menu, logo, search; bag/account live in the
 * bottom nav. The full search field shows from 1280px; below that a search
 * button opens a field under the bar, already focused.
 */
const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 50);
        ticking = false;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => setSearchOpen(false), [pathname]);

  const searchToggle = (
    <button
      type="button"
      onClick={() => setSearchOpen((open) => !open)}
      className="flex h-11 w-11 items-center justify-center rounded-full text-primary transition-colors hover:bg-platinum xl:hidden"
      aria-label={searchOpen ? "Close search" : "Search"}
      aria-expanded={searchOpen}
    >
      {searchOpen ? (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      )}
    </button>
  );

  return (
    <header
      className={`sticky top-0 z-50 w-full max-w-full bg-platinum transition-shadow duration-300 ${
        scrolled ? "shadow-premium" : ""
      }`}
    >
      <div className="grid h-14 w-full grid-cols-[1fr_auto_1fr] items-center px-2 md:h-20 md:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-6">
          <NavDrawer />
          <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
            {LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className={`group relative whitespace-nowrap text-sm font-medium text-gray-700 transition-colors hover:text-primary ${
                  link.from === "xl" ? "hidden xl:inline" : ""
                }`}
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-primary transition-all duration-300 group-hover:w-full" />
              </Link>
            ))}
          </nav>
        </div>

        <Link href="/" className="flex items-center justify-center px-2" aria-label="Viora Jewel home">
          <Image
            src="/logo%20compressed.png"
            alt="Viora Jewels Logo"
            width={360}
            height={120}
            sizes="(max-width: 767px) 140px, 220px"
            className="h-12 w-auto object-contain md:h-16"
            style={{ width: "auto" }}
            priority
          />
        </Link>

        <div className="flex items-center justify-end gap-1">
          {searchToggle}
          <NavIcons />
        </div>
      </div>

      {searchOpen && (
        <div className="px-4 pb-3 xl:hidden">
          <div className="mx-auto max-w-xl">
            <SearchBar variant="mobile" autoFocus onSubmit={() => setSearchOpen(false)} />
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
