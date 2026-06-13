import type { Metadata } from "next";
import { Montserrat, Cormorant_Garamond } from "next/font/google";
import "lenis/dist/lenis.css";
import "./globals.css";
import dynamic from "next/dynamic";
import Navbar from "@/components/Navbar";
import SmoothScroll from "@/components/SmoothScroll";

// Below-the-fold / non-critical → defer JS to shrink the initial bundle.
const Footer = dynamic(() => import("@/components/Footer"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));
const ConsentManager = dynamic(() => import("@/components/ConsentManager"));
import { WixClientContextProvider } from "@/context/wixContext";
import { ToastProvider } from "@/components/Toast";
import AnnouncementMarquee from "@/components/AnnouncementMarquee";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.viorajewel.in"
).replace(/\/$/, "");

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Viora Jewel — Everyday Jewellery & Gifts",
    template: "%s | Viora Jewel",
  },
  description:
    "Affordable Indian ethnic jewellery, earrings & gifts mostly under ₹649. Free shipping across India. Easy 48-hour exchange.",
  applicationName: "Viora Jewel",
  keywords: [
    "Viora Jewel",
    "Indian ethnic jewellery",
    "affordable jewellery India",
    "earrings online",
    "jewellery gifting",
    "gold plated jewellery",
  ],
  authors: [{ name: "Viora Jewel" }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Viora Jewel",
    title: "Viora Jewel — Everyday Jewellery & Gifts",
    description:
      "Affordable Indian ethnic jewellery, earrings & gifts under ₹649. Free shipping across India. Easy 48-hour exchange.",
    url: SITE_URL,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "Viora Jewel — Everyday Jewellery & Gifts",
    description:
      "Affordable Indian ethnic jewellery, earrings & gifts under ₹649. Free shipping. Easy 48-hour exchange.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Viora Jewel",
  url: SITE_URL,
  logo: `${SITE_URL}/logo%20compressed.png`,
  description:
    "Viora Jewel is an Indian direct-to-consumer brand offering affordable everyday ethnic jewellery, earrings and gifting pieces mostly under ₹649, with free shipping across India and easy 48-hour exchange.",
  address: {
    "@type": "PostalAddress",
    addressCountry: "IN",
  },
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    areaServed: "IN",
    availableLanguage: ["English", "Hindi"],
    url: `${SITE_URL}/contact`,
  },
  sameAs: [
    "https://www.instagram.com/viorajewel",
    "https://www.facebook.com/viorajewel",
  ],
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Viora Jewel",
  url: SITE_URL,
  inLanguage: "en-IN",
  publisher: { "@type": "Organization", name: "Viora Jewel" },
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/list?search={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

const globalSchema = {
  "@context": "https://schema.org",
  "@graph": [organizationSchema, websiteSchema],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-IN"
      className={`${montserrat.variable} ${cormorant.variable} w-full max-w-[100vw]`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(globalSchema) }}
        />
      </head>
      <body className={`${montserrat.className} w-full max-w-[100vw]`}>
        <SmoothScroll />
        <WixClientContextProvider>
          <ToastProvider>
            <AnnouncementMarquee />

            <Navbar />
            <main className="w-full max-w-[100vw] pb-20 md:pb-0">
              {children}
            </main>
            <Footer />
            <MobileBottomNav />
          </ToastProvider>
        </WixClientContextProvider>
        <ConsentManager />
      </body>
    </html>
  );
}
