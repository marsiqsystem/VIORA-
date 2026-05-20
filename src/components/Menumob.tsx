"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { CATEGORY_LINKS } from "@/lib/categories";

const Menu = () => {
  const [open, setOpen] = useState(false);

  // Lock body scroll when menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div className="relative">
      {/* Hamburger Button */}
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Open menu"
      >
        <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        onClick={() => setOpen(false)}
      />

      {/* Side Menu - Glass Effect */}
      <div
        className={`fixed top-0 left-0 h-full w-[85vw] max-w-[320px] z-50 transform transition-all duration-500 ease-out ${open
            ? "translate-x-0 opacity-100"
            : "-translate-x-full opacity-0"
          }`}
        style={{
          background: "rgba(255, 255, 255, 0.97)",
          boxShadow: open ? "0 25px 50px -12px rgba(0, 0, 0, 0.25)" : "none",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200/50">
          <span className="text-lg font-playfair font-semibold text-primary">Menu</span>
          <button
            onClick={() => setOpen(false)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Menu Links */}
        <nav className="flex flex-col p-4">
          {[
            { href: "/", label: "Home", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
            { href: "/list", label: "Categories", icon: "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" },
            { href: "/profile?tab=wishlist", label: "Wishlist", icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" },
            { href: "/contact", label: "Contact Us", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
            { href: "/profile", label: "My Profile", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
            { href: "/orders", label: "My Orders", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
          ].map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-4 px-4 py-4 text-gray-700 hover:text-primary hover:bg-primary/5 rounded-xl transition-all duration-200"
              style={{
                animationDelay: `${index * 50}ms`,
              }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
              <span className="text-base font-medium">{item.label}</span>
              <svg className="w-4 h-4 ml-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
          <div className="mt-3 border-t border-gray-200 pt-3">
            <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Categories
            </p>
            {CATEGORY_LINKS.map((category) => (
              <Link
                key={category.slug}
                href={`/list?cat=${category.slug}#product-grid`}
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-primary"
              >
                {category.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-5 border-t border-gray-200/50">
          <p className="text-xs text-gray-500 text-center">
            Copyright 2026 Viora Jewels. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Menu;

