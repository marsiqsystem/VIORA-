"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCartStore } from "@/hooks/useCartStore";
import { useCommerceUi } from "@/hooks/useCommerceUi";
import CartContents from "./CartContents";

/** Slide-in bag, opened by every add-to-cart button and the cart icons. */
const CartDrawer = () => {
  const { drawerOpen, closeDrawer, openCheckout } = useCommerceUi();
  const itemCount = useCartStore((s) =>
    (s.cart.lineItems || []).reduce((sum, li) => sum + (li.quantity || 1), 0)
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen, closeDrawer]);

  if (!mounted) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[9000] ${drawerOpen ? "" : "pointer-events-none"}`} aria-hidden={!drawerOpen}>
      <div
        onClick={closeDrawer}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${drawerOpen ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Your bag"
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <p className="font-playfair text-xl font-bold text-primary">
            Your bag{itemCount > 0 && <span className="ml-1.5 font-sans text-sm font-normal text-gray-500">({itemCount})</span>}
          </p>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close bag"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {drawerOpen && <CartContents variant="drawer" onCheckout={openCheckout} onContinueShopping={closeDrawer} />}
      </aside>
    </div>,
    document.body
  );
};

export default CartDrawer;
