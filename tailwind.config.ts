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
        "viora-gradient": "linear-gradient(135deg, #F5F1EA 0%, #EFE4CE 55%, #F5E8E2 100%)",
        "viora-gradient-dark": "linear-gradient(135deg, #1A1410 0%, #5A0A18 100%)",
      },
      colors: {
        primary: {
          DEFAULT: "#1A1410",
          light: "#2B211B",
          dark: "#0F0B08",
        },
        silver: {
          DEFAULT: "#C9A66B",
          light: "#EFE4CE",
          dark: "#A9844C",
          muted: "#F5E8E2",
        },
        platinum: {
          DEFAULT: "#F5F1EA",
          warm: "#F5E8E2",
        },
        accent: {
          DEFAULT: "#9B1B30",
          secondary: "#5C5450",
          gold: "#C9A66B",
        },
      },
      fontFamily: {
        playfair: ["var(--font-cormorant)", "Cormorant Garamond", "serif"],
        inter: ["var(--font-montserrat)", "Montserrat", "sans-serif"],
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
        'silver': '0 4px 15px rgba(201, 166, 107, 0.24)',
      },
    },
  },
  plugins: [],
};
export default config;
