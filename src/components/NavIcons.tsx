"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useWixClient } from "@/hooks/useWixClient";
import Cookies from "js-cookie";
import { useCartStore } from "@/hooks/useCartStore";
import { useCommerceUi } from "@/hooks/useCommerceUi";
import { useWishlistStore } from "@/hooks/useWishlistStore";
import SearchBar from "./SearchBar";

const NavIcons = () => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const router = useRouter();

  const wixClient = useWixClient();
  const isLoggedIn = wixClient.auth.loggedIn();
  const openDrawer = useCommerceUi((s) => s.openDrawer);
  const wishlistCount = useWishlistStore((s) => s.items.length);

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

  const { counter, getCart } = useCartStore();

  useEffect(() => {
    getCart(wixClient);
  }, [wixClient, getCart]);

  const profileMenuItems = [
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
      href: "/wishlist",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ),
    },
    {
      label: "Profile & rewards",
      href: "/profile",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="relative hidden items-center gap-1 md:flex xl:gap-2">
      {/* Full search field from 1280px; below that the navbar shows a search button */}
      <div className="mr-2 hidden xl:block">
        <SearchBar variant="desktop" />
      </div>

      {/* Wishlist */}
      <Link
        href="/wishlist"
        className="relative flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-200 hover:bg-platinum"
        aria-label={wishlistCount > 0 ? `Wishlist, ${wishlistCount} saved` : "Wishlist"}
        title="Wishlist"
      >
        <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        {wishlistCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white">
            {wishlistCount}
          </span>
        )}
      </Link>

      {/* Profile Icon */}
      <div ref={profileRef} className="relative">
        <button
          onClick={handleProfile}
          className="relative group flex items-center justify-center w-11 h-11 rounded-full hover:bg-platinum transition-colors duration-200"
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
            <div className="px-4 py-4 bg-gradient-to-r from-gray-50 to-platinum border-b border-gray-100">
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

      {/* Cart icon — opens the site-wide bag drawer */}
      <button
        type="button"
        className="relative group cursor-pointer flex items-center justify-center w-11 h-11 rounded-full hover:bg-platinum transition-colors duration-200"
        onClick={() => openDrawer()}
        aria-label="Open your bag"
        title="Your bag"
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
    </div>
  );
};

export default NavIcons;
