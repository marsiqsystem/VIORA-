import type { Metadata } from "next";
import { Montserrat, Cormorant_Garamond } from "next/font/google";
import "lenis/dist/lenis.css";
import "./globals.css";
import dynamic from "next/dynamic";
import Script from "next/script";
import Navbar from "@/components/Navbar";
import SmoothScroll from "@/components/SmoothScroll";

const GTAG_ID = "GT-T8ZJVVT9";

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
      "Affordable Indian fashion jewellery, earrings & gifts under ₹649. Free shipping across India. Easy 48-hour exchange.",
    url: SITE_URL,
    locale: "en_IN",
    images: [
      {
        url: "/banner-optimized.jpg",
        width: 1200,
        height: 630,
        alt: "Viora Jewel — Indian fashion jewellery sets, earrings and gifts",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Viora Jewel — Everyday Jewellery & Gifts",
    description:
      "Affordable Indian fashion jewellery, earrings & gifts under ₹649. Free shipping. Easy 48-hour exchange.",
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
  email: "viorajewels6@gmail.com",
  description:
    "Viora Jewel is an Indian direct-to-consumer brand offering affordable everyday fashion jewellery, earrings and gifting pieces mostly under ₹649, with free shipping across India and an easy 48-hour exchange on damaged or incorrect items.",
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
    email: "viorajewels6@gmail.com",
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
          `}
        </Script>
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
