"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { CATEGORY_LINKS } from "@/lib/categories";

const Menu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  // Create a portal root on mount and remove on unmount
  useEffect(() => {
    const el = document.createElement("div");
    el.id = "menu-portal";
    document.body.appendChild(el);
    setPortalEl(el);
    return () => {
      if (document.body.contains(el)) document.body.removeChild(el);
    };
  }, []);

  // Close on scroll / Esc and lock body scroll when menu is open
  useEffect(() => {
    const handleScroll = () => setOpen(false);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("scroll", handleScroll, { passive: true });
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const menuItems = [
    { href: "/", label: "Home", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    { href: "/list", label: "Categories", icon: "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" },
    { href: "/new-arrivals", label: "New Arrivals", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" },
    { href: "/profile?tab=wishlist", label: "Wishlist", icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" },
    { href: "/contact", label: "Contact Us", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  ];

  const menuContent = (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${open
          ? "opacity-100 pointer-events-auto"
          : "opacity-0 pointer-events-none"
          }`}
        style={{ zIndex: 9998 }}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />

      {/* Sidebar Menu - Glass Effect */}
      <aside
        id="sidebar-menu"
        role="dialog"
        aria-modal="true"
        className={`fixed top-0 left-0 h-full w-[400px] flex flex-col transform transition-all duration-500 ease-out ${open ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0"
          }`}
        style={{
          zIndex: 9999,
          background: "rgba(255, 255, 255, 0.97)",
          boxShadow: open ? "0 25px 50px -12px rgba(0, 0, 0, 0.25)" : "none",
        }}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-gray-200/50">
          <span className="text-xl font-playfair font-semibold text-primary">Menu</span>
          <button
            onClick={() => setOpen(false)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close menu"
          >
            <svg width="20" height="20" className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Menu Links */}
          <nav className="flex flex-col p-6 gap-1">
            {menuItems.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-4 px-4 py-4 text-gray-700 hover:text-primary hover:bg-primary/5 rounded-xl transition-all duration-200 group"
              >
                <svg width="20" height="20" className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                </svg>
                <span className="text-base font-medium">{item.label}</span>
                <svg width="16" height="16" className="w-4 h-4 ml-auto text-gray-300 group-hover:text-primary group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
            <div className="mt-4 border-t border-gray-200 pt-4">
              <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Categories
              </p>
              {CATEGORY_LINKS.map((category) => (
                <Link
                  key={category.slug}
                  href={`/list?cat=${category.slug}#product-grid`}
                  onClick={() => setOpen(false)}
                  className="flex items-center px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-primary"
                >
                  {category.label}
                </Link>
              ))}
            </div>
          </nav>

        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-6 border-t border-gray-200/50 bg-white/80">
          <div className="flex items-center justify-center gap-4 mb-4">
            <a
              href="https://www.instagram.com/_viorajewels_?igsh=bGV3eTFjazIwejNs"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="p-2 rounded-full text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-[#9B1B30] hover:scale-110"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </a>
            <a
              href="https://www.facebook.com/profile.php?id=61589962820647"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="p-2 rounded-full text-gray-500 transition-all duration-200 hover:bg-gray-100 hover:text-[#9B1B30] hover:scale-110"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
          </div>
          <p className="text-xs text-gray-400 text-center">
            Copyright 2026 Viora Jewels. All rights reserved.
          </p>
        </div>
      </aside>
    </>
  );

  return (
    <div>
      {/* Hamburger Button */}
      <button
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="sidebar-menu"
        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Open menu"
      >
        <svg width="24" height="24" className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Render portal when portal root exists */}
      {portalEl ? createPortal(menuContent, portalEl) : null}
    </div>
  );
};

export default Menu;
