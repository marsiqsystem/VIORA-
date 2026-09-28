"use client";

import { create } from "zustand";

// Site-wide shopping UI state: ONE bag drawer and ONE checkout modal
// (mounted by CommerceOverlays), opened from anywhere — add-to-cart buttons,
// the navbar, the mobile bottom nav, the cart page, Buy Now.
type CommerceUiState = {
  drawerOpen: boolean;
  checkoutOpen: boolean;
  /** Catalog item id of the product just added — highlighted in the bag. */
  lastAddedId: string | null;
  /** The shopper typed or removed a coupon themselves; automatic coupons stay off. */
  shopperChoseCoupon: boolean;
  /** Last automatic ladder-coupon attempt ("CODE@subtotal"), shared so the bag and checkout don't both retry. */
  autoCouponAttempt: string;
  /** Ladder code applied automatically, shown as "applied for you". */
  autoAppliedCode: string;
  openDrawer: (lastAddedId?: string) => void;
  closeDrawer: () => void;
  openCheckout: () => void;
  closeCheckout: () => void;
  setShopperChoseCoupon: (value: boolean) => void;
  setAutoCouponAttempt: (value: string) => void;
  setAutoAppliedCode: (value: string) => void;
};

export const useCommerceUi = create<CommerceUiState>((set) => ({
  drawerOpen: false,
  checkoutOpen: false,
  lastAddedId: null,
  shopperChoseCoupon: false,
  autoCouponAttempt: "",
  autoAppliedCode: "",
  openDrawer: (lastAddedId) => set({ drawerOpen: true, lastAddedId: lastAddedId || null }),
  closeDrawer: () => set({ drawerOpen: false, lastAddedId: null }),
  openCheckout: () => set({ checkoutOpen: true, drawerOpen: false }),
  closeCheckout: () => set({ checkoutOpen: false }),
  setShopperChoseCoupon: (value) => set({ shopperChoseCoupon: value }),
  setAutoCouponAttempt: (value) => set({ autoCouponAttempt: value }),
  setAutoAppliedCode: (value) => set({ autoAppliedCode: value }),
}));
