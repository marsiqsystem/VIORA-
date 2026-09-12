/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,

  // Journal MDX lives in /content/journal at repo root. Vercel serverless
  // functions (sitemap ISR, and any runtime route that reads posts) don't
  // trace this folder automatically because the path is computed via
  // process.cwd(). Force-include it so getAllJournalPosts() sees the files
  // at runtime — otherwise sitemap.xml comes out with 0 journal URLs and
  // Bing/Google never discover new articles.
  experimental: {
    outputFileTracingIncludes: {
      "/sitemap.xml": ["./content/journal/**/*"],
      "/journal": ["./content/journal/**/*"],
      "/journal/[slug]": ["./content/journal/**/*"],
    },
  },

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
    // Security headers applied to every response. Deliberately excludes a strict
    // Content-Security-Policy: this app loads Wix, Razorpay, Meta Pixel and GA
    // from many origins, and a wrong CSP silently breaks checkout/tracking. The
    // headers below are safe with zero breakage risk.
    //   - X-Frame-Options / frame-ancestors: block clickjacking (our pages can't
    //     be framed by other sites; Razorpay/Wix widgets WE embed are unaffected).
    //   - X-Content-Type-Options: stop MIME sniffing.
    //   - Referrer-Policy: send origin only cross-site (keeps UTM on same-site).
    //   - Permissions-Policy: disable camera/mic/geolocation we never use. Note
    //     'payment' is intentionally NOT disabled so Razorpay keeps working.
    //   - HSTS: force HTTPS for a year.
    const securityHeaders = [
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      },
    ];

    return [
      {
        // Every route gets the security headers.
        source: "/:path*",
        headers: securityHeaders,
      },
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
