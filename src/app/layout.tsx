import type { Metadata } from "next";
import { Montserrat, Cormorant_Garamond } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import dynamic from "next/dynamic";
import Navbar from "@/components/Navbar";
import MetaPixel from "@/components/MetaPixel";

// Below-the-fold / non-critical → defer JS to shrink the initial bundle.
const Footer = dynamic(() => import("@/components/Footer"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));
const Clarity = dynamic(() => import("@/components/Clarity"));
import { WixClientContextProvider } from "@/context/wixContext";
import { ToastProvider } from "@/components/Toast";
import AnnouncementMarquee from "@/components/AnnouncementMarquee";

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
  title: {
    default: "Viora Jewels - Everyday Jewellery & Gifts",
    template: "%s | Viora Jewels",
  },
  description:
    "Shop Viora Jewels for elegant jewellery, thoughtful gifts, and occasion-ready accessories with secure checkout and fast delivery.",
  keywords: [
    "jewellery",
    "jewels",
    "gifting",
    "accessories",
    "online shopping",
    "Viora Jewels",
    "premium jewellery",
  ],
  authors: [{ name: "Viora Jewels" }],
  openGraph: {
    title: "Viora Jewels - Everyday Jewellery & Gifts",
    description:
      "Discover elegant jewellery and thoughtful gifts at Viora Jewels with secure checkout and fast delivery.",
    url: "https://viorajewels.co",
    siteName: "Viora Jewels",
    type: "website",
    locale: "en_US",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${cormorant.variable} w-full max-w-[100vw]`}
    >
      <body className={`${montserrat.className} w-full max-w-[100vw]`}>
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
        <MetaPixel />
        <Clarity />
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        )}
      </body>
    </html>
  );
}
