import { OAuthStrategy, createClient } from "@wix/sdk";
import { collections, products } from "@wix/stores";
import { checkout, orders } from "@wix/ecom";
import { cookies } from "next/headers";
import { members } from '@wix/members';
import { reviews } from '@wix/reviews';
import { files } from '@wix/media';

export const wixClientServer = async () => {
  let refreshToken;

  try {
    const cookieStore = cookies();
    refreshToken = JSON.parse(cookieStore.get("refreshToken")?.value || "{}");
  } catch (e) {}

  const wixClient = createClient({
    modules: {
      products,
      collections,
      orders,
      checkout,
      members,
      reviews,
      files,
    },
    auth: OAuthStrategy({
      clientId: process.env.NEXT_PUBLIC_WIX_CLIENT_ID!,
      tokens: {
        refreshToken,
        accessToken: { value: "", expiresAt: 0 },
      },
    }),
  });

  return wixClient;
};
