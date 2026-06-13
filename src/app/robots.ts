import type { MetadataRoute } from "next";

// Canonical site origin. Mirrors app/sitemap.ts and the openGraph URL in
// app/layout.tsx; overridable per-environment with NEXT_PUBLIC_SITE_URL.
const BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.viorajewel.in"
).replace(/\/$/, "");

const DISALLOWED = [
  "/cart",
  "/checkout",
  "/success",
  "/login",
  "/profile",
  "/orders",
  "/account",
  "/api/",
];

// Explicit allow-list for AI training & real-time search crawlers. Listing
// each bot by name protects us if a provider ever flips its default policy
// to "block unless explicitly allowed".
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "ClaudeBot",
  "anthropic-ai",
  "Applebot-Extended",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/" })),
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOWED,
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
