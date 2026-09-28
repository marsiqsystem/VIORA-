"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useCartStore } from "@/hooks/useCartStore";
import { useWixClient } from "@/hooks/useWixClient";
import { useCommerceUi } from "@/hooks/useCommerceUi";
import { isServiceLine } from "@/lib/cartLines";
import CartContents from "@/components/cart/CartContents";

/** Full-page bag — the same contents as the slide-in drawer, in two columns. */
const CartPage = () => {
  const wixClient = useWixClient();
  const { cart, getCart } = useCartStore();
  const openCheckout = useCommerceUi((s) => s.openCheckout);

  useEffect(() => {
    getCart(wixClient).catch(() => {});
  }, [getCart, wixClient]);

  // Arriving from a WhatsApp checkout reminder (/recover/<id>) or an old
  // /checkout link: open checkout straight away, once, as soon as the cart is here.
  const openedFromLink = useRef(false);
  useEffect(() => {
    if (openedFromLink.current || !cart.lineItems?.length) return;
    if (new URLSearchParams(window.location.search).get("checkout") !== "1") return;
    openedFromLink.current = true;
    openCheckout();
  }, [cart.lineItems?.length, openCheckout]);

  const pieces = (cart.lineItems || [])
    .filter((li: any) => !isServiceLine(li))
    .reduce((sum: number, li: any) => sum + (li.quantity || 1), 0);

  return (
    <div className="mx-auto min-h-[calc(100vh-180px)] max-w-6xl px-4 pb-28 pt-5 md:px-6 md:pb-12 md:pt-8 lg:px-8">
      <div className="mb-4 flex items-baseline justify-between gap-4 md:mb-6">
        <h1 className="font-playfair text-[28px] font-bold text-primary md:text-4xl">
          Your bag
          {pieces > 0 && (
            <span className="ml-2 font-sans text-sm font-normal text-gray-500 md:text-base">
              ({pieces} {pieces === 1 ? "piece" : "pieces"})
            </span>
          )}
        </h1>
        <Link href="/list" className="shrink-0 text-sm font-semibold text-accent underline-offset-4 hover:underline">
          Continue shopping
        </Link>
      </div>
      <CartContents variant="page" onCheckout={openCheckout} />
    </div>
  );
};

export default CartPage;
