"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CATEGORY_LINKS } from "@/lib/categories";
import {
  CLUB_VIORA_MINIMUM,
  CLUB_VIORA_PERCENT,
  CLUB_VIORA_PLUS_MINIMUM,
  CLUB_VIORA_PLUS_PERCENT,
  FESTIVE_COMBO,
  PREPAID_DISCOUNT,
  isFestiveComboLive,
} from "@/lib/checkoutPricing";
import { whatsappLink } from "@/lib/contact";
import { trackContact } from "@/lib/metaPixel";
import { useWixClient } from "@/hooks/useWixClient";
import { useWishlistStore } from "@/hooks/useWishlistStore";

type NavCategory = { slug: string; label: string; count: number; image: string | null };

// Shared across drawer instances so the tiles load once per visit.
let categoriesPromise: Promise<NavCategory[]> | null = null;
const loadCategories = () => {
  if (!categoriesPromise) {
    categoriesPromise = fetch("/api/nav-categories")
      .then((res) => (res.ok ? res.json() : []))
      .catch(() => {
        categoriesPromise = null;
        return [];
      });
  }
  return categoriesPromise;
};

const chevron = (
  <svg className="ml-auto h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

const icon = (d: string) => (
  <svg className="h-5 w-5 shrink-0 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const ICONS = {
  orders: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  heart: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  chat: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  mail: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  exchange: "M4 8h13l-3-3M20 16H7l3 3",
  truck: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z",
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

/** Site menu: offers, category tiles with real photos, account and help. One component for phone and desktop. */
const NavDrawer = () => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [categories, setCategories] = useState<NavCategory[] | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [festive, setFestive] = useState(false);
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wixClient = useWixClient();
  const wishlistCount = useWishlistStore((s) => s.items.length);

  useEffect(() => setMounted(true), []);

  // Any navigation closes the menu (covers links, back button and search).
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    setLoggedIn(wixClient.auth.loggedIn());
    setFestive(isFestiveComboLive());
    loadCategories().then(setCategories);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const trigger = triggerRef.current;
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      trigger?.focus({ preventScroll: true });
    };
  }, [open, wixClient]);

  const close = () => setOpen(false);
  const tiles: NavCategory[] =
    categories && categories.length > 0
      ? categories
      : CATEGORY_LINKS.map((c) => ({ slug: c.slug, label: c.slug === "all-products" ? "All Jewellery" : c.label, count: 0, image: null }));

  const rowClass = "flex min-h-[48px] items-center gap-3 px-4 text-[15px] font-medium text-primary hover:bg-platinum";

  const panel = (
    <div className={open ? "" : "pointer-events-none"} aria-hidden={!open}>
      <div
        className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        style={{ zIndex: 10000 }}
        onClick={close}
      />
      <aside
        id="site-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`fixed inset-y-0 left-0 flex w-[88vw] max-w-[380px] flex-col bg-white shadow-2xl transition-[transform,visibility] duration-300 ease-out ${
          open ? "visible translate-x-0" : "invisible -translate-x-full"
        }`}
        style={{ zIndex: 10001 }}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-silver-light px-4">
          <span className="font-playfair text-xl font-semibold text-primary">Menu</span>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            className="flex h-11 w-11 items-center justify-center rounded-full text-primary hover:bg-platinum"
            aria-label="Close menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {/* Offers — the same rewards the bag applies automatically */}
          <Link href="/list" onClick={close} className="m-4 block bg-accent px-4 py-3 text-white">
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">Offers · no code needed</span>
            {festive && (
              <span className="mt-1 block text-sm font-bold">
                🪔 ₹{FESTIVE_COMBO.amount} OFF any 2 pieces · till {FESTIVE_COMBO.endLabel}
              </span>
            )}
            <span className="mt-1 block text-sm font-semibold">Pay online: FREE delivery + ₹{PREPAID_DISCOUNT} OFF</span>
            <span className="block text-sm font-semibold">
              {CLUB_VIORA_PERCENT}% OFF on ₹{CLUB_VIORA_MINIMUM}+ · {CLUB_VIORA_PLUS_PERCENT}% OFF on ₹
              {CLUB_VIORA_PLUS_MINIMUM.toLocaleString("en-IN")}+
            </span>
          </Link>

          <p className="px-4 pb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">Shop by category</p>
          <ul className="grid grid-cols-2 gap-2 px-4">
            {tiles.map((c) => (
              <li key={c.slug} className={c.slug === "all-products" && tiles.length % 2 === 1 ? "col-span-2" : ""}>
                <Link
                  href={c.slug === "all-products" ? "/list" : `/list?cat=${c.slug}`}
                  onClick={close}
                  className={`relative block overflow-hidden bg-platinum ${
                    c.slug === "all-products" && tiles.length % 2 === 1 ? "aspect-[8/3]" : "aspect-[4/3]"
                  }`}
                >
                  {c.image && <Image src={c.image} alt="" fill sizes="180px" className="object-cover" />}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden="true" />
                  <span className="absolute inset-x-2 bottom-2 text-white">
                    <span className="block text-[13px] font-bold leading-tight">{c.label}</span>
                    {c.count > 0 && <span className="block text-[11px] text-white/80">{c.count} designs</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <ul className="mt-3 flex flex-wrap gap-2 px-4">
            {[
              { href: "/list?sort=price-asc", label: "Lowest price first" },
              { href: "/list?under=499", label: "Under ₹500" },
              { href: "/list?sort=new", label: "Newest" },
            ].map((chip) => (
              <li key={chip.href}>
                <Link href={chip.href} onClick={close} className="flex h-9 items-center rounded-full border border-gray-300 px-3 text-[13px] font-semibold text-primary hover:border-accent">
                  {chip.label}
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-6 px-4 pb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">Your account</p>
          <nav aria-label="Account">
            {loggedIn ? (
              <Link href="/account/orders" onClick={close} className={rowClass}>
                {icon(ICONS.orders)} My orders {chevron}
              </Link>
            ) : (
              <Link href="/login" onClick={close} className={rowClass}>
                {icon(ICONS.user)} Log in / Sign up {chevron}
              </Link>
            )}
            <Link href="/wishlist" onClick={close} className={rowClass}>
              {icon(ICONS.heart)} Wishlist
              {wishlistCount > 0 && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-white">{wishlistCount}</span>
              )}
              {chevron}
            </Link>
            {loggedIn && (
              <Link href="/profile" onClick={close} className={rowClass}>
                {icon(ICONS.user)} My profile {chevron}
              </Link>
            )}
          </nav>

          <p className="mt-6 px-4 pb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">Help</p>
          <nav aria-label="Help">
            <a
              href={whatsappLink("Hi Viora, I need help choosing a piece.")}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                trackContact();
                close();
              }}
              className={rowClass}
            >
              {icon(ICONS.chat)} Chat on WhatsApp {chevron}
            </a>
            <Link
              href="/contact"
              onClick={() => {
                trackContact();
                close();
              }}
              className={rowClass}
            >
              {icon(ICONS.mail)} Contact us {chevron}
            </Link>
            <Link href="/exchange-policy" onClick={close} className={rowClass}>
              {icon(ICONS.exchange)} Exchange policy {chevron}
            </Link>
            <Link href="/shipping-policy" onClick={close} className={rowClass}>
              {icon(ICONS.truck)} Shipping &amp; delivery {chevron}
            </Link>
            <Link href="/about" onClick={close} className={rowClass}>
              {icon(ICONS.info)} About Viora {chevron}
            </Link>
          </nav>

          <div className="mt-6 flex items-center justify-center gap-3 border-t border-silver-light px-4 py-5">
            <a
              href="https://www.instagram.com/_viorajewels_?igsh=bGV3eTFjazIwejNs"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-platinum hover:text-accent"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </a>
            <a
              href="https://www.facebook.com/profile.php?id=61589962820647"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-platinum hover:text-accent"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
          </div>
        </div>
      </aside>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label="Open menu"
        className="flex h-11 w-11 items-center justify-center rounded-full text-primary hover:bg-platinum"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {mounted && createPortal(panel, document.body)}
    </>
  );
};

export default NavDrawer;
