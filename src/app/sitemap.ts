import type { MetadataRoute } from "next";
import { wixClientServer } from "@/lib/wixClientServer";

// Regenerate the sitemap at most once per hour so newly published products
// get picked up without rebuilding the whole site.
export const revalidate = 3600;

// Canonical site origin. Mirrors the openGraph URL in app/layout.tsx; can be
// overridden per-environment with NEXT_PUBLIC_SITE_URL (no trailing slash).
const BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://viorajewels.co"
).replace(/\/$/, "");

// Public, indexable routes. Transactional/auth pages (cart, checkout, success,
// login, profile, orders, account) are intentionally excluded.
const STATIC_ROUTES: {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}[] = [
  { path: "/", changeFrequency: "daily", priority: 1.0 },
  { path: "/list", changeFrequency: "daily", priority: 0.9 },
  { path: "/products", changeFrequency: "daily", priority: 0.8 },
  { path: "/new-arrivals", changeFrequency: "daily", priority: 0.8 },
  { path: "/gifting", changeFrequency: "weekly", priority: 0.7 },
  { path: "/gift-packaging", changeFrequency: "weekly", priority: 0.6 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.5 },
  { path: "/shipping-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/exchange-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms-and-conditions", changeFrequency: "yearly", priority: 0.3 },
];

// Fetch every visible product from Wix, paging through the full catalog.
// Product detail pages are served from the [slug] route, so each entry maps to
// `${BASE_URL}/${slug}`.
async function getProductEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const wixClient = await wixClientServer();

    const entries: MetadataRoute.Sitemap = [];
    let query = await wixClient.products.queryProducts().limit(100).find();

    while (true) {
      for (const product of query.items) {
        // Only index active/visible products that have a usable slug.
        if (product.visible === false || !product.slug) continue;

        entries.push({
          url: `${BASE_URL}/${product.slug}`,
          lastModified: product.lastUpdated
            ? new Date(product.lastUpdated)
            : new Date(),
          changeFrequency: "weekly",
          priority: 0.7,
        });
      }

      if (!query.hasNext()) break;
      query = await query.next();
    }

    return entries;
  } catch (err) {
    // Never let a Wix outage break sitemap generation — fall back to static
    // routes only and log for visibility.
    console.error("[sitemap] Failed to fetch Wix products:", err);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${BASE_URL}${route.path === "/" ? "" : route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const productEntries = await getProductEntries();

  return [...staticEntries, ...productEntries];
}
