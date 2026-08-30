import type { Metadata } from "next";
import { Montserrat, Cormorant_Garamond } from "next/font/google";
import "lenis/dist/lenis.css";
import "./globals.css";
import dynamic from "next/dynamic";
import Script from "next/script";
import { GoogleTagManager } from "@next/third-parties/google";
import Navbar from "@/components/Navbar";
import SmoothScroll from "@/components/SmoothScroll";

const GTAG_ID = "GT-T8ZJVVT9";
const GOOGLE_ADS_ID = "AW-18325090177";
const GA4_ID = "G-2PY7N0E5WE";
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

// Below-the-fold / non-critical → defer JS to shrink the initial bundle.
const Footer = dynamic(() => import("@/components/Footer"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));
const ConsentManager = dynamic(() => import("@/components/ConsentManager"));
import { WixClientContextProvider } from "@/context/wixContext";
import { ToastProvider } from "@/components/Toast";
import AnnouncementMarquee from "@/components/AnnouncementMarquee";
const PendingReviewFlusher = dynamic(
  () => import("@/components/PendingReviewFlusher")
);

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
    default: "Viora Jewel — Artificial Jewellery, Necklace Sets & Earrings Online",
    template: "%s | Viora Jewel",
  },
  description:
    "Shop premium artificial & fashion jewellery online at Viora Jewel — necklace sets for women, earrings, long & stone necklace sets, bridal jewellery sets and Rakhi gifts. Free shipping across India, easy 48-hour exchange.",
  applicationName: "Viora Jewel",
  keywords: [
    "Viora Jewel",
    "Artificial Jewellery",
    "Imitation Jewellery",
    "Artificial Jewellery Online",
    "Online Artificial Jewellery Set",
    "Fashion Jewelry",
    "Jewellery Online",
    "Jewellery Website",
    "Necklace",
    "Necklace set for women",
    "Long Necklace",
    "Stone Necklace Set",
    "Bridal Jewellery Set",
    "Jewellery Set",
    "Earrings",
    "Earrings for women",
    "Jewellery for Rakhi",
    "Rakhi Jewellery",
    "affordable jewellery India",
    "jewellery gifting",
  ],
  authors: [{ name: "Viora Jewel" }],
  openGraph: {
    type: "website",
    siteName: "Viora Jewel",
    title: "Viora Jewel — Artificial Jewellery, Necklace Sets & Earrings Online",
    description:
      "Shop premium artificial & fashion jewellery online — necklace sets for women, earrings, long & stone necklace sets, bridal sets and Rakhi gifts. Free shipping across India. Easy 48-hour exchange.",
    url: SITE_URL,
    locale: "en_IN",
    images: [
      {
        url: "/banner-optimized.jpg",
        width: 1200,
        height: 630,
        alt: "Viora Jewel — artificial & fashion jewellery, necklace sets, earrings and gifts",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Viora Jewel — Artificial Jewellery, Necklace Sets & Earrings",
    description:
      "Premium artificial & fashion jewellery online — necklace sets for women, earrings, bridal sets & Rakhi gifts. Free shipping across India.",
    images: ["/banner-optimized.jpg"],
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
  alternateName: "Viora Jewels",
  url: SITE_URL,
  logo: `${SITE_URL}/logo%20compressed.png`,
  email: "mail@viorajewel.in",
  description:
    "Viora Jewel is an Indian direct-to-consumer brand offering affordable artificial and fashion jewellery for women — necklace sets, long and stone necklace sets, earrings, bridal jewellery sets and Rakhi gifts. Pieces are crafted from premium brass with high-quality rhodium plating and original glass stones, with free shipping across India and an easy 48-hour exchange on damaged or incorrect items.",
  address: {
    "@type": "PostalAddress",
    streetAddress: "38C B.T. Road (Kalpana Apartment), 1st Floor, Flat 1A",
    addressLocality: "Kolkata",
    addressRegion: "West Bengal",
    postalCode: "700056",
    addressCountry: "IN",
  },
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "mail@viorajewel.in",
    areaServed: "IN",
    availableLanguage: ["English", "Hindi"],
    url: `${SITE_URL}/contact`,
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "09:00",
      closes: "18:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Saturday",
      opens: "10:00",
      closes: "16:00",
    },
  ],
  sameAs: [
    "https://www.instagram.com/_viorajewels_",
    "https://www.facebook.com/profile.php?id=61589962820647",
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
      {GTM_ID && <GoogleTagManager gtmId={GTM_ID} />}
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(globalSchema) }}
        />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GTAG_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GTAG_ID}');
            gtag('config', '${GOOGLE_ADS_ID}');
            gtag('config', '${GA4_ID}');
          `}
        </Script>
      </head>
      <body className={`${montserrat.className} w-full max-w-[100vw]`}>
        <SmoothScroll />
        <WixClientContextProvider>
          <ToastProvider>
            <PendingReviewFlusher />
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
