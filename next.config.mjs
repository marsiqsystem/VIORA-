/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,

  images: {
    // Serve modern, smaller formats automatically. Next will pick AVIF first,
    // then WebP, then fall back to the original. AVIF cuts payload ~50% vs JPEG.
    formats: ["image/avif", "image/webp"],
    // Cache optimized variants on the edge for 30 days instead of 60s default.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    deviceSizes: [360, 414, 640, 750, 828, 1080, 1200, 1440, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "static.wixstatic.com" },
      { protocol: "https", hostname: "people.pic1.co" },
      { protocol: "https", hostname: "app-uploads-cdn.fera.ai" },
    ],
  },

  // Long-cache the static assets in /public (Next emits them under /_next/static
  // with hashed names already; this covers raw /public/* requests).
  async headers() {
    return [
      {
        source: "/:all*(svg|jpg|jpeg|png|webp|avif|gif|ico|woff|woff2)",
        locale: false,
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
