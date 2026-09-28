"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useCommerceUi } from "@/hooks/useCommerceUi";

const CartDrawer = dynamic(() => import("./cart/CartDrawer"), { ssr: false });
const CheckoutModal = dynamic(() => import("./CheckoutModal"), { ssr: false });

/**
 * The site's single bag drawer and single checkout modal. Each loads on first
 * use and then stays mounted, so typed checkout details survive closing it.
 */
const CommerceOverlays = () => {
  const { drawerOpen, checkoutOpen, closeCheckout } = useCommerceUi();
  const [drawerLoaded, setDrawerLoaded] = useState(false);
  const [checkoutLoaded, setCheckoutLoaded] = useState(false);

  useEffect(() => {
    if (drawerOpen) setDrawerLoaded(true);
  }, [drawerOpen]);
  useEffect(() => {
    if (checkoutOpen) setCheckoutLoaded(true);
  }, [checkoutOpen]);

  return (
    <>
      {drawerLoaded && <CartDrawer />}
      {checkoutLoaded && <CheckoutModal open={checkoutOpen} onClose={closeCheckout} />}
    </>
  );
};

export default CommerceOverlays;
