"use client";

import Link from "next/link";
import Menu from "./Menu";
import Menumob from "./Menumob";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import SearchBar from "./SearchBar";

const NavIcons = dynamic(() => import("./NavIcons"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-4 xl:gap-6">
      <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />
      <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />
      <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />
    </div>
  ),
});

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrolled(window.scrollY > 50);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>


      <header
        className={`sticky top-0 left-0 right-0 z-50 w-full max-w-full bg-platinum transition-shadow duration-300 ${
          scrolled ? "shadow-premium" : ""
        }`}
      >
        <div className="relative h-20 md:h-24 w-full px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <div className="h-full flex items-center justify-between md:hidden">
            <div className="w-16 flex items-center justify-start">
              <Menumob />
            </div>
            <div className="flex-1 flex items-center justify-center">
              <Link href="/" className="flex items-center">
                <Image
                  src="/logo%20compressed.png"
                  alt="Viora Jewels Logo"
                  width={200}
                  height={72}
                  sizes="200px"
                  className="h-14 w-auto object-contain"
                  style={{ width: "auto" }}
                  priority
                />
              </Link>
            </div>
            <div className="w-16 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsMobileSearchOpen((open) => !open)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-silver-light"
                aria-label={isMobileSearchOpen ? "Close search" : "Open search"}
                aria-expanded={isMobileSearchOpen}
                title="Search"
              >
                {isMobileSearchOpen ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="w-full hidden md:flex items-center justify-between h-full">
            <div className="flex items-center gap-8">
              <Menu />
              <nav className="hidden lg:flex items-center gap-8">
                <Link
                  href="/"
                  className="text-sm font-medium text-gray-700 hover:text-primary transition-colors relative group"
                >
                  Home
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full"></span>
                </Link>
                <Link
                  href="/list"
                  className="text-sm font-medium text-gray-700 hover:text-primary transition-colors relative group"
                >
                  Categories
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full"></span>
                </Link>
                {/* Gifting link hidden — feature on hold. Restore by uncommenting.
                <Link
                  href="/gifting"
                  className="text-sm font-medium text-gray-700 hover:text-primary transition-colors relative group"
                >
                  Gifting
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full"></span>
                </Link>
                */}
                <Link
                  href="/profile?tab=wishlist"
                  className="text-sm font-medium text-gray-700 hover:text-primary transition-colors relative group"
                  aria-label="Wishlist"
                >
                  Wishlist
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full"></span>
                </Link>
              </nav>
            </div>

            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <Link href="/" className="flex items-center">
                <Image
                  src="/logo%20compressed.png"
                  alt="Viora Jewels Logo"
                  width={360}
                  height={120}
                  sizes="(max-width: 1024px) 220px, 280px"
                  className="h-16 md:h-20 w-auto object-contain"
                  style={{ width: "auto" }}
                  priority
                />
              </Link>
            </div>

            <div className="flex items-center gap-6">
              <NavIcons />
            </div>
          </div>
        </div>

        {/* Mobile-only collapsible search */}
        <div
          className={`block md:hidden overflow-hidden transition-all duration-300 ease-out ${
            isMobileSearchOpen ? "max-h-24 opacity-100 pb-3" : "max-h-0 opacity-0 pb-0"
          }`}
        >
          <div className="px-4">
            <SearchBar
              variant="mobile"
              onSubmit={() => setIsMobileSearchOpen(false)}
            />
          </div>
        </div>
      </header>
    </>
  );
};

export default Navbar;
