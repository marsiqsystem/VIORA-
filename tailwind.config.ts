import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        // Beige stops removed — off-white only (brand request 2026-09-15).
        "viora-gradient": "linear-gradient(135deg, #FFFFFF 0%, #F8F8F8 100%)",
        "viora-gradient-dark": "linear-gradient(135deg, #1A1410 0%, #5A0A18 100%)",
      },
      colors: {
        primary: {
          DEFAULT: "#1A1410",
          light: "#2B211B",
          dark: "#0F0B08",
        },
        silver: {
          // Champagne-gold accent (text and buttons on dark sections).
          DEFAULT: "#C9A66B",
          // Neutral grey for borders and dividers — was beige #EFE4CE. Beige panels now use
          // bg-platinum (#F8F8F8) instead (brand request 2026-09-15).
          light: "#E8E8E8",
          dark: "#A9844C",
          // Neutral grey — was blush beige #F5E8E2.
          muted: "#E8E8E8",
        },
        platinum: {
          // Off-white (was the warm "beach" cream #F5F1EA) — brand request 2026-09-11.
          DEFAULT: "#F8F8F8",
          // Was pinkish champagne #F5E8E2 — also off-white per brand request.
          warm: "#F8F8F8",
        },
        accent: {
          DEFAULT: "#9B1B30",
          secondary: "#5C5450",
          gold: "#C9A66B",
        },
      },
      fontFamily: {
        // Class names are historical: `font-playfair` = headings, `font-inter` = body.
        playfair: ["var(--font-heading)", "Georgia", "serif"],
        inter: ["var(--font-body)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out forwards",
        "fade-in-up": "fade-in-up 0.6s ease-out forwards",
        "slide-in-left": "slide-in-left 0.6s ease-out forwards",
        "slide-in-right": "slide-in-right 0.6s ease-out forwards",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "shimmer": "shimmer 2s infinite",
      },
      boxShadow: {
        'premium': '0 4px 20px rgba(0, 0, 0, 0.08)',
        'premium-hover': '0 8px 30px rgba(0, 0, 0, 0.12)',
        'silver': '0 4px 15px rgba(0, 0, 0, 0.08)',
      },
    },
  },
  plugins: [],
};
export default config;
