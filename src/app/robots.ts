import type { MetadataRoute } from "next";

// Canonical site origin. Mirrors app/sitemap.ts and the openGraph URL in
// app/layout.tsx; overridable per-environment with NEXT_PUBLIC_SITE_URL.
const BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://viorajewel.in"
).replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep transactional/auth pages out of search results. These mirror the
      // routes intentionally excluded from the sitemap.
      disallow: [
        "/cart",
        "/checkout",
        "/success",
        "/login",
        "/profile",
        "/orders",
        "/account",
        "/api/",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
