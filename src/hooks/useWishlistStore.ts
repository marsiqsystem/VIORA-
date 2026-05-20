"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type WishlistItem = {
  id: string;
  slug: string;
  name: string;
  image: string;
  price: number;
  fullPrice?: number;
  addedAt: number;
};

type WishlistState = {
  items: WishlistItem[];
  hasHydrated: boolean;
  isWishlisted: (id: string) => boolean;
  toggle: (item: Omit<WishlistItem, "addedAt">) => boolean;
  remove: (id: string) => void;
  clear: () => void;
  setHasHydrated: (v: boolean) => void;
};

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      hasHydrated: false,
      isWishlisted: (id) => get().items.some((it) => it.id === id),
      toggle: (item) => {
        const exists = get().items.some((it) => it.id === item.id);
        if (exists) {
          set({ items: get().items.filter((it) => it.id !== item.id) });
          return false;
        }
        set({
          items: [{ ...item, addedAt: Date.now() }, ...get().items],
        });
        return true;
      },
      remove: (id) =>
        set({ items: get().items.filter((it) => it.id !== id) }),
      clear: () => set({ items: [] }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: "viora-wishlist",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
