"use client";

import { createClient, OAuthStrategy } from "@wix/sdk";
import { products, collections } from "@wix/stores";
import { checkout, currentCart, orders } from "@wix/ecom";
import { members } from "@wix/members";
import { reviews } from "@wix/reviews";
import Cookies from "js-cookie";
import { createContext, ReactNode } from "react";
import { redirects } from '@wix/redirects';

// Parse the persisted refresh token defensively. A corrupted/half-written
// cookie would otherwise make JSON.parse throw at module load, which crashes
// the entire Wix client — breaking login, cart, and every other Wix call.
const parseRefreshToken = () => {
  try {
    const raw = Cookies.get("refreshToken");
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    // Drop the bad cookie so the next session starts clean.
    try {
      Cookies.remove("refreshToken");
    } catch {}
    return {};
  }
};

const refreshToken = parseRefreshToken();

const wixClient = createClient({
  modules: {
    products,
    collections,
    checkout,
    currentCart,
    orders,
    members,
    reviews,
    redirects
  },
  auth: OAuthStrategy({
    clientId: process.env.NEXT_PUBLIC_WIX_CLIENT_ID!,
    tokens: {
      refreshToken,
      accessToken: { value: "", expiresAt: 0 },
    },
  }),
});

export type WixClient = typeof wixClient;

export const WixClientContext = createContext<WixClient>(wixClient);

export const WixClientContextProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  return (
    <WixClientContext.Provider value={wixClient}>
      {children}
    </WixClientContext.Provider>
  );
};
