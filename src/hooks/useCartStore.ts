import { create } from "zustand";
import { currentCart } from "@wix/ecom";
import { WixClient } from "@/context/wixContext";

type CartState = {
  cart: currentCart.Cart;
  isLoading: boolean;
  counter: number;
  getCart: (wixClient: WixClient) => Promise<void>;
  addItem: (
    wixClient: WixClient,
    productId: string,
    variantId: string,
    quantity: number,
    selectedOptions?: Record<string, string>
  ) => Promise<void>;
  removeItem: (wixClient: WixClient, itemId: string) => Promise<void>;
  updateQuantity: (
    wixClient: WixClient,
    itemId: string,
    quantity: number
  ) => Promise<void>;
  clearCart: () => void;
};

const EMPTY_CART = {} as currentCart.Cart;

export const useCartStore = create<CartState>((set) => ({
  cart: EMPTY_CART,
  isLoading: true,
  counter: 0,
  getCart: async (wixClient) => {
    try {
      const cart = await wixClient.currentCart.getCurrentCart();
      set({
        cart: cart || EMPTY_CART,
        isLoading: false,
        counter: cart?.lineItems?.length || 0,
      });
    } catch (err) {
      // Wix throws "OWNED_CART_NOT_FOUND" after deleteCurrentCart() — that means
      // the cart is gone, not that the request failed. Reset local state so the
      // UI reflects the empty backend instead of clinging to the stale items.
      set({ cart: EMPTY_CART, counter: 0, isLoading: false });
    }
  },
  addItem: async (wixClient, productId, variantId, quantity, selectedOptions) => {
    set((state) => ({ ...state, isLoading: true }));
    try {
      await wixClient.currentCart.addToCurrentCart({
        lineItems: [
          {
            catalogReference: {
              appId: "215238eb-22a5-4c36-9e7b-e7c08025e04e",
              catalogItemId: productId,
              ...((variantId && variantId !== "00000000-0000-0000-0000-000000000000") || (selectedOptions && Object.keys(selectedOptions).length > 0) ? {
                options: {
                  ...(variantId && variantId !== "00000000-0000-0000-0000-000000000000" && { variantId }),
                  ...(selectedOptions && Object.keys(selectedOptions).length > 0 && { options: selectedOptions }),
                }
              } : {}),
            },
            quantity: quantity,
          },
        ],
      });

      // Fetch the updated cart state to ensure global UI sync
      const updatedCart = await wixClient.currentCart.getCurrentCart();
      
      set({
        cart: updatedCart || EMPTY_CART,
        counter: updatedCart?.lineItems?.length || 0,
        isLoading: false,
      });
    } catch (err) {
      console.error("Failed to add item to cart in store:", err);
      set((state) => ({ ...state, isLoading: false }));
      throw err; // Propagate error so the UI can catch it
    }
  },
  removeItem: async (wixClient, itemId) => {
    set((state) => ({ ...state, isLoading: true }));
    const response = await wixClient.currentCart.removeLineItemsFromCurrentCart(
      [itemId]
    );

    set({
      cart: response.cart,
      counter: response.cart?.lineItems?.length || 0,
      isLoading: false,
    });
  },
  updateQuantity: async (wixClient, itemId, quantity) => {
    set((state) => ({ ...state, isLoading: true }));
    try {
      const response = await wixClient.currentCart.updateCurrentCartLineItemQuantity(
        [{ _id: itemId, quantity }]
      );
      set({
        cart: response.cart,
        counter: response.cart?.lineItems?.length || 0,
        isLoading: false,
      });
    } catch (err) {
      console.error("Failed to update quantity:", err);
      set((state) => ({ ...state, isLoading: false }));
    }
  },
  // Synchronously zero-out local cart state. Call this after a successful
  // checkout (server-side cart has already been deleted by deleteCurrentCart).
  clearCart: () => {
    set({ cart: EMPTY_CART, counter: 0, isLoading: false });
  },
}));
