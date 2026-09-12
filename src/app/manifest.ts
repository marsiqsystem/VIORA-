import type { MetadataRoute } from "next";

// Web App Manifest (served at /manifest.webmanifest). Gives the site an
// installable identity + theme colours, and satisfies the "modern web signals"
// SEO check. Kept minimal and brand-accurate: plum theme on the off-white
// ground the rest of the UI uses. Icon reuses the existing compressed logo
// (space in the filename is URL-encoded).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Viora Jewel — Artificial Jewellery & Necklace Sets",
    short_name: "Viora Jewel",
    description:
      "Shop premium artificial & fashion jewellery online — necklace sets, earrings & bridal sets. Free shipping across India.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8F8F8",
    theme_color: "#9B1B30",
    icons: [
      {
        src: "/logo%20compressed.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
