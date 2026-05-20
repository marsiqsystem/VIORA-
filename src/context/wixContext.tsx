"use client";

import { createClient, OAuthStrategy } from "@wix/sdk";
import { products, collections } from "@wix/stores";
import { checkout, currentCart, orders } from "@wix/ecom";
import { members } from "@wix/members";
import { reviews } from "@wix/reviews";
import Cookies from "js-cookie";
import { createContext, ReactNode } from "react";
import { redirects } from '@wix/redirects';

const refreshToken = JSON.parse(Cookies.get("refreshToken") || "{}");

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
