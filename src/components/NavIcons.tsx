"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import CartModal from "./CartModal";
import { useWixClient } from "@/hooks/useWixClient";
import Cookies from "js-cookie";
import { useCartStore } from "@/hooks/useCartStore";
import SearchBar from "./SearchBar";
import { trackContact } from "@/lib/metaPixel";

const NavIcons = () => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const cartRef = useRef<HTMLDivElement>(null);

  const router = useRouter();
  const pathName = usePathname();

  const wixClient = useWixClient();
  const isLoggedIn = wixClient.auth.loggedIn();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close cart dropdown when clicking outside (mousedown on anything that's not the cart container).
  // Skip clicks that originate inside an open dialog/modal (e.g. CheckoutModal,
  // which portals to document.body and would otherwise be treated as "outside"
  // the cart — closing the cart and unmounting the dialog mid-interaction).
  useEffect(() => {
    if (!isCartOpen) return;

    const handleClickOutsideCart = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target && target.closest('[role="dialog"]')) return;
      if (cartRef.current && !cartRef.current.contains(event.target as Node)) {
        setIsCartOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutsideCart);
    return () => document.removeEventListener("mousedown", handleClickOutsideCart);
  }, [isCartOpen]);

  const handleProfile = () => {
    if (!isLoggedIn) {
      router.push("/login");
    } else {
      setIsProfileOpen((prev) => !prev);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    Cookies.remove("refreshToken");
    const { logoutUrl } = await wixClient.auth.logout(window.location.href);
    setIsLoading(false);
    setIsProfileOpen(false);
    router.push(logoutUrl);
  };

  const { cart, counter, getCart } = useCartStore();

  useEffect(() => {
    getCart(wixClient);
  }, [wixClient, getCart]);

  const profileMenuItems = [
    {
      label: "My Profile",
      href: "/profile",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      label: "My Orders",
      href: "/account/orders",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      label: "Wishlist",
      href: "/profile?tab=wishlist",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ),
    },
    {
      label: "Coupons & Offers",
      href: "/profile?tab=coupons",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      ),
    },
    {
      label: "Gift Cards",
      href: "/profile?tab=giftcards",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
        </svg>
      ),
    },
    {
      label: "Account Settings",
      href: "/profile?tab=settings",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex items-center gap-4 xl:gap-6 relative">
      {/* Search Bar (Desktop) */}
      <SearchBar variant="desktop" />

      {/* Contact / Support Icon */}
      <Link
        href="/contact"
        onClick={() => trackContact()}
        className="relative group flex items-center justify-center w-10 h-10 rounded-full hover:bg-silver-light transition-colors duration-200"
        aria-label="Contact support"
        title="Contact Support"
      >
        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h2.28a2 2 0 011.94 1.515l.7 2.79a2 2 0 01-.51 1.86l-1.27 1.27a11 11 0 005.44 5.44l1.27-1.27a2 2 0 011.86-.51l2.79.7A2 2 0 0121 16.72V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        <span className="absolute -bottom-1 left-0 w-full h-[1.5px] bg-[#1A1410] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></span>
      </Link>

      {/* Profile Icon */}
      <div ref={profileRef} className="relative">
        <button
          onClick={handleProfile}
          className="relative group flex items-center justify-center w-10 h-10 rounded-full hover:bg-silver-light transition-colors duration-200"
          aria-label="Profile"
          title={isLoggedIn ? "My Account" : "Login"}
        >
          <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="absolute -bottom-1 left-0 w-full h-[1.5px] bg-[#1A1410] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></span>
        </button>

        {/* Profile Dropdown */}
        {isProfileOpen && isLoggedIn && (
          <div className="profile-dropdown">
            {/* User Info Header */}
            <div className="px-4 py-4 bg-gradient-to-r from-gray-50 to-silver-light border-b border-gray-100">
              <p className="text-sm font-semibold text-primary">Welcome back!</p>
              <p className="text-xs text-gray-500 mt-0.5">Manage your account</p>
            </div>

            {/* Menu Items */}
            <div className="py-2">
              {profileMenuItems.map((item, index) => (
                <Link
                  key={index}
                  href={item.href}
                  className="profile-dropdown-item"
                  onClick={() => setIsProfileOpen(false)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>

            {/* Logout */}
            <div className="profile-dropdown-divider" />
            <button
              onClick={handleLogout}
              disabled={isLoading}
              className="w-full profile-dropdown-item text-red-600 hover:bg-red-50"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>{isLoading ? "Logging out..." : "Logout"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Cart Icon + Dropdown (wrapped for click-outside detection) */}
      <div ref={cartRef} className="relative">
        <button
          type="button"
          className="relative group cursor-pointer flex items-center justify-center w-10 h-10 rounded-full hover:bg-silver-light transition-colors duration-200"
          onClick={() => setIsCartOpen((prev) => !prev)}
          aria-label="Shopping Cart"
          aria-expanded={isCartOpen}
          title="Shopping Cart"
        >
          <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          <span className="absolute -bottom-1 left-0 w-full h-[1.5px] bg-[#1A1410] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></span>
          {counter > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full text-white text-xs flex items-center justify-center font-medium">
              {counter}
            </span>
          )}
        </button>
        {isCartOpen && <CartModal />}
      </div>
    </div>
  );
};

export default NavIcons;
