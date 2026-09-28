/**
 * Reels shipped with the site itself — video files live in public/reels/.
 * Keyed by the product's base name, slugified ("Royal Heartfall Jewelry Set" →
 * "royal-heartfall-jewelry-set"), so every colour variant shows them. Videos
 * uploaded to the product's media in Wix are shown as well, after these.
 *
 * Keep files small: 720x1280 H.264 MP4 with a JPG poster frame next to each video,
 * plus a p-<name>.mp4/.jpg preview (540x960, first 6 s, silent) that small tiles
 * and the floating bubble loop — the full file only loads when someone taps.
 *
 * Order is the sales order: someone WEARING it first (she pictures herself in
 * it), then the colour options (choosing which one, not whether), then a
 * sparkle close-up (proof of finish). Filenames: w = worn, c = colours,
 * s = sparkle; 1–4 = the July 2026 shoot clips (silent).
 */
export type LocalReel = {
  src: string;
  poster?: string;
  /** false for silent files — hides the viewer's sound toggle. */
  hasAudio?: boolean;
  /** Light 540p clip + poster for tiles and the bubble. */
  preview?: string;
  previewPoster?: string;
};

const reel = (key: string, name: string, hasAudio = true): LocalReel => ({
  src: `/reels/${key}/${name}.mp4`,
  poster: `/reels/${key}/${name}.jpg`,
  hasAudio,
  preview: `/reels/${key}/p-${name}.mp4`,
  previewPoster: `/reels/${key}/p-${name}.jpg`,
});

// July 2026 shoot clips were encoded without audio.
const july = (key: string, n: number) => reel(key, String(n), false);

const CW = "crystal-wings-set";
const ES = "eternal-shine-jewelry-set";
const CB = "celestial-bloom-set";
const RH = "royal-heartfall-jewelry-set";
const NT = "noble-teardrop-harmony-set";
const AE = "azure-empress-sapphire-necklace-set";
const SB = "scarlet-bloom-set";
const RB = "rosa-blush-set";

export const PRODUCT_REELS: Record<string, LocalReel[]> = {
  // Object order = home "Worn by you" order (strongest hook, then best sellers).
  // "Straight out of your Pinterest board": pink / clear / green / blue worn → all colours on the bust → sparkle.
  [SB]: [reel(SB, "w1"), reel(SB, "c1"), reel(SB, "s1")],
  // Worn with a saree → try-on clip → sparkle → purple set (July).
  [NT]: [reel(NT, "w1"), reel(NT, "w2"), reel(NT, "s1"), july(NT, 1), july(NT, 2), july(NT, 3), july(NT, 4)],
  // Blue set worn → try-on clip → blue / red / black in hand (July clips removed by the owner).
  [RH]: [reel(RH, "w1"), reel(RH, "w2"), reel(RH, "c1")],
  // Black set worn with a saree → try-on clip → sparkle close-up.
  [CB]: [reel(CB, "w1"), reel(CB, "w2"), reel(CB, "s1")],
  // Worn in the car (Aqua Blue) → red / blue / green butterflies → sparkle on the bust.
  [CW]: [reel(CW, "w1"), reel(CW, "c1", false), reel(CW, "s1")],
  // Blue worn (putting it on) → red close-up (Red is the colour in stock) → try-on clip.
  [AE]: [reel(AE, "w1"), reel(AE, "s1", false), reel(AE, "w2")],
  // All five colours on the bust (July clips removed by the owner).
  [ES]: [reel(ES, "c1", false)],
  // Worn in the car → close-up in a gloved hand → earring close-up worn (owner's order). Sold out at the
  // time of writing — the reels show again as soon as it's restocked.
  [RB]: [reel(RB, "w2"), reel(RB, "s1"), reel(RB, "w1")],
};

/**
 * Site-wide floating reel (components/FloatingReel.tsx), in play order. The
 * first one is the bubble: Scarlet Bloom — the lowest-priced set, worn, in
 * every colour. Then the try-on videos of the best sellers. Designs that are
 * out of stock are skipped automatically (/api/floating-reels). `colour` = the
 * colour worn in the video, so "Shop now" opens that exact piece when in stock.
 */
export const FLOATING_REELS: { key: string; reel: LocalReel; colour?: string }[] = [
  { key: SB, reel: reel(SB, "w1") },
  { key: NT, reel: reel(NT, "w2"), colour: "burgundy" },
  { key: CW, reel: reel(CW, "w1"), colour: "aqua blue" },
  { key: CB, reel: reel(CB, "w2"), colour: "black" },
  { key: RH, reel: reel(RH, "w2"), colour: "blue" },
  { key: AE, reel: reel(AE, "w1"), colour: "blue" },
];

export const reelKey = (baseName: string) =>
  baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
