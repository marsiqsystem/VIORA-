/**
 * Every designed image slot on the home page, keyed by its ID in the design brief
 * (Desktop/Viora/Viora-Home-Page-Design-Brief.txt).
 *
 * Until the design team's files arrive, each slot points at an existing image and
 * is marked `placeholder: true` (development builds label it on screen with its
 * brief ID). To place a delivered file:
 *   1. copy it to public/home/<brief folder>/  (e.g. public/home/01-hero/)
 *   2. set `src` to that path and `placeholder: false`
 * Nothing else needs to change — layouts already use the brief's aspect ratios.
 *
 * `src: null` means "no designed image yet — use a live Wix product/collection
 * photo instead", so the page never shows an empty box.
 */

export type HomeImage = {
  src: string | null;
  alt: string;
  briefId: string;
  placeholder: boolean;
  /** CSS object-position, to keep the jewellery in frame on placeholder crops. */
  position?: string;
};

// ---- H1 · Hero carousel (desktop ~8:3 · phones 3:2, shown whole with the text below) ----
// Phone art delivered 2026-09-26 as 1550x1015 landscapes, so phones show the whole
// banner and put the live copy in a panel underneath (HeroCarousel).

export type HeroSlideId = "best-sellers" | "festive-combo" | "wedding" | "noble-teardrop" | "crystal-wings" | "little-more-you";

export type HeroSlideAsset = {
  id: HeroSlideId;
  desktop: HomeImage;
  mobile: HomeImage;
  /**
   * How the live text sits on the desktop art (phones always put it in a panel below the art):
   * - "full" (default): big headline over a dark fade — needs a calm left side.
   * - "card": a small white card in the corner — for busy art (faces, collages).
   * - "baked": the banner already carries its own text/button — no overlay,
   *   the whole slide is the link (phones: the art is the link, panel shows sub + button).
   */
  variant?: "full" | "card" | "baked";
  /** Hidden while the festive combo slide is live (it re-uses this art). */
  hideDuringFestive?: boolean;
  /** Desktop only — the art has no usable phone crop (e.g. wide banners with printed text). */
  hideOnMobile?: boolean;
  /** Only shown inside this window (ISO, IST). Omit for always-on slides. */
  startsAt?: string;
  endsAt?: string;
};

export const HERO_SLIDES: HeroSlideAsset[] = [
  {
    id: "festive-combo",
    // Window comes from FESTIVE_COMBO in checkoutPricing (see lib/homeData.ts).
    // Delivered 2026-09-26 at 2048x768; mobile still to come.
    desktop: { src: "/home/01-hero/vj_h1-b_festive-combo_desktop.jpg", alt: "Model wearing a sapphire-blue three-row necklace set with drop earrings", briefId: "H1-B", placeholder: false, position: "75% 40%" },
    mobile: { src: "/home/01-hero/vj_h1-b_festive-combo_mobile.jpg", alt: "Model wearing a sapphire-blue three-row necklace set with drop earrings", briefId: "H1-B", placeholder: false },
  },
  {
    id: "best-sellers",
    // Delivered 2026-09-18 at 2062x701 (not the brief's 2560x960); mobile still to come.
    desktop: { src: "/home/01-hero/vj_h1-a_best-sellers_desktop.jpg", alt: "Model wearing a pink crystal necklace with matching earrings", briefId: "H1-A", placeholder: false, position: "80% 50%" },
    mobile: { src: "/home/01-hero/vj_h1-a_best-sellers_mobile.jpg", alt: "Model wearing a pink crystal necklace with matching earrings", briefId: "H1-A", placeholder: false },
  },
  {
    // Same art as the festive slide — shown until that campaign starts.
    id: "noble-teardrop",
    hideDuringFestive: true,
    desktop: { src: "/home/01-hero/vj_h1-b_festive-combo_desktop.jpg", alt: "Model wearing the sapphire-blue Noble Teardrop three-row set with drop earrings", briefId: "H1-B", placeholder: false, position: "75% 40%" },
    mobile: { src: "/home/01-hero/vj_h1-b_festive-combo_mobile.jpg", alt: "Model wearing the sapphire-blue Noble Teardrop three-row set with drop earrings", briefId: "H1-B", placeholder: false },
  },
  {
    // Delivered 2026-09-26 ("landing 1", three panels) — faces sit under the usual text area, so a corner card.
    id: "crystal-wings",
    variant: "card",
    desktop: { src: "/home/01-hero/vj_h1-e_crystal-wings_desktop.jpg", alt: "Aqua Blue Crystal Wings butterfly necklace and earrings, worn, in three close-ups", briefId: "H1-E", placeholder: false, position: "50% 50%" },
    mobile: { src: "/home/01-hero/vj_h1-e_crystal-wings_mobile.jpg", alt: "Aqua Blue Crystal Wings butterfly necklace and earrings, worn, in three close-ups", briefId: "H1-E", placeholder: false },
  },
  {
    // Delivered 2026-09-26 ("landing 4") with its own headline and Explore button.
    id: "little-more-you",
    variant: "baked",
    desktop: { src: "/home/01-hero/vj_h1-f_little-more-you_desktop.jpg", alt: "Viora — A little more you. Jewellery for every story. Pink crystal necklace and earrings on a gift box. Explore now", briefId: "H1-F", placeholder: false, position: "100% 50%" },
    mobile: { src: "/home/01-hero/vj_h1-f_little-more-you_mobile.jpg", alt: "Viora — A little more you. Jewellery for every story. Pink crystal necklace and earrings on a gift box. Explore now", briefId: "H1-F", placeholder: false },
  },
  {
    id: "wedding",
    startsAt: "2026-11-12T00:00:00+05:30",
    desktop: { src: "/new-arrival-optimized.jpg", alt: "Emerald-style statement necklace set", briefId: "H1-D", placeholder: true, position: "70% 50%" },
    mobile: { src: "/new-arrival-optimized.jpg", alt: "Emerald-style statement necklace set", briefId: "H1-D", placeholder: true, position: "62% 50%" },
  },
];

// ---- S2 · Trust strip icons (SVG) -------------------------------------------
// null = built-in line icon. Set to "/home/02-trust-icons/vj_s2-1_cod-available.svg" etc.
export const TRUST_ICONS: Record<"cod" | "exchange" | "delivery" | "secure" | "packed", string | null> = {
  cod: null, // S2-1
  exchange: null, // S2-2
  delivery: null, // S2-3
  secure: null, // S2-4
  packed: null, // S2-5
};

// ---- S3 · Category tiles (1080x1080, shown as circles) -----------------------
// Delivered 2026-09-18 (AI-generated from product references); S3-7 is a 2x2 mosaic of S3-1/3/4/6.

export type CategoryTile = {
  slug: string;
  label: string;
  image: HomeImage;
  /** Placeholder source when `image.src` is null. */
  fallback: "collection" | "product";
};

export const CATEGORY_TILES: CategoryTile[] = [
  { slug: "best-sellers", label: "Best Sellers", fallback: "collection", image: { src: "/home/03-categories/vj_s3-1_best-sellers.jpg", alt: "Sapphire-blue three-row necklace set worn with a navy blouse", briefId: "S3-1", placeholder: false } },
  { slug: "ear-rings", label: "Earrings", fallback: "collection", image: { src: "/home/03-categories/vj_s3-2_earrings.jpg", alt: "Ruby-red crystal drop earring worn close-up", briefId: "S3-2", placeholder: false } },
  { slug: "wedding-reception", label: "Wedding", fallback: "collection", image: { src: "/home/03-categories/vj_s3-3_wedding.jpg", alt: "Emerald-green necklace set worn with a maroon silk saree", briefId: "S3-3", placeholder: false } },
  { slug: "office-parties", label: "Office & Parties", fallback: "collection", image: { src: "/home/03-categories/vj_s3-4_office-parties.jpg", alt: "Crystal butterfly necklace and earrings worn with a black top", briefId: "S3-4", placeholder: false } },
  { slug: "new-arrivals", label: "New Arrivals", fallback: "collection", image: { src: "/home/03-categories/vj_s3-6_new-arrivals.jpg", alt: "Garnet fringe necklace set worn with an ivory blouse", briefId: "S3-6", placeholder: false } },
  // The collection's own image is the logo, so this one uses a product photo.
  { slug: "all-products", label: "All Jewellery", fallback: "product", image: { src: "/home/03-categories/vj_s3-7_all-jewellery.jpg", alt: "Four Viora necklace sets in blue, green, crystal and garnet", briefId: "S3-7", placeholder: false } },
];

// ---- S5 · Shop by price (1080x1350) ------------------------------------------

export type PriceBand = {
  key: string;
  label: string;
  /** Selling price ≤ under, or > over. */
  under?: number;
  over?: number;
  image: HomeImage;
};

export const PRICE_BANDS: PriceBand[] = [
  { key: "499", label: "₹499 & under", under: 499, image: { src: "/home/05-price/vj_s5-1_under-499_crystal-wings-aqua.jpg", alt: "Aqua Blue Crystal Wings butterfly necklace and earrings", briefId: "S5-1", placeholder: false } },
  { key: "599", label: "₹599 & under", under: 599, image: { src: "/home/05-price/vj_s5-2_under-599_rosa-blush-pink.jpg", alt: "Pink Rosa Blush necklace and earrings", briefId: "S5-2", placeholder: false } },
  { key: "699", label: "₹699 & under", under: 699, image: { src: "/home/05-price/vj_s5-3_under-699_noble-teardrop-garnet.jpg", alt: "Model wearing a garnet three-row necklace set with drop earrings", briefId: "S5-3", placeholder: false, position: "50% 35%" } },
  { key: "700", label: "Statement sets", over: 699, image: { src: null, alt: "Statement jewellery sets", briefId: "S5-4", placeholder: true } },
];

// ---- S6 · Spend-more ladder banner -------------------------------------------
export const LADDER_BANNER = {
  desktop: { src: null, alt: "", briefId: "S6-A", placeholder: true } as HomeImage, // 2560x640
  mobile: { src: null, alt: "", briefId: "S6-A", placeholder: true } as HomeImage, // 1080x1080
};

// ---- S7 · Festive combo ------------------------------------------------------

/**
 * S7-C · Festive combo pairings (1080x1350) for "any 2 pieces, ₹100 OFF". Leave
 * empty to pair best sellers in two different colours automatically; once the
 * owner picks the pairs, list them here by product base name with the image.
 */
export const COMBO_PAIR_OVERRIDES: { first: string; second: string; image: HomeImage }[] = [];

// ---- S8 · "Worn by you" reels (1080x1920 MP4 + poster) -----------------------
// Home reels also pick up everything in src/data/productReels.ts automatically.
export const HOME_REELS: { src: string; poster?: string; productSlug: string }[] = [];

// ---- S10 · Why Viora close-ups (1080x1080) ------------------------------------
// Delivered 2026-09-26, one per WhyViora point in the same order (titles are in the art).
export const QUALITY_IMAGES: HomeImage[] = [
  { src: "/home/10-why-viora/vj_s10-a1_premium-brass.jpg", alt: "Back of a pink necklace showing the brass settings", briefId: "S10-A1", placeholder: false },
  { src: "/home/10-why-viora/vj_s10-a2_rhodium-shine.jpg", alt: "Rhodium-plated links holding clear stones", briefId: "S10-A2", placeholder: false },
  { src: "/home/10-why-viora/vj_s10-a3_glass-stones.jpg", alt: "Loose clear glass stones on marble", briefId: "S10-A3", placeholder: false },
  { src: "/home/10-why-viora/vj_s10-a4_hand-checked.jpg", alt: "Gloved hands checking a pink flower necklace before packing", briefId: "S10-A4", placeholder: false },
];

// ---- S11 / S12 · Packaging and brand note ------------------------------------
export const BRAND_NOTE = {
  // Delivered 2026-09-26 (lifestyle shot; a founder/team portrait can replace it later).
  image: { src: "/home/12-brand/vj_s12-a_brand-note.jpg", alt: "Smiling woman wearing a ruby-red necklace and drop earrings", briefId: "S12-A", placeholder: false, position: "55% 50%" } as HomeImage, // 1080x1350
  /** /about hero (4:3 on phones, half-width on desktop). */
  aboutHero: { src: "/home/12-brand/vj_about-hero.jpg", alt: "Smiling woman wearing a ruby-red necklace and drop earrings", briefId: "S12-A", placeholder: false, position: "58% 50%" } as HomeImage,
  packaging: { src: null, alt: "Viora packaging", briefId: "S11-B", placeholder: true } as HomeImage, // 1080x1350
  // S12-C: replace with the owner's own 3–4 sentences.
  heading: "Designed and packed with care in Kolkata",
  story:
    "Viora is a small Indian jewellery brand making diamond-style sets and earrings you can wear to every function without overspending. Every piece is hand-checked before it's packed, and every order ships from our Kolkata studio.",
};

// ---- S13 · WhatsApp club banner ----------------------------------------------
export const WHATSAPP_BANNER = {
  desktop: { src: null, alt: "", briefId: "S13-A", placeholder: true } as HomeImage, // 2560x640
  mobile: { src: null, alt: "", briefId: "S13-A", placeholder: true } as HomeImage, // 1080x1080
};
