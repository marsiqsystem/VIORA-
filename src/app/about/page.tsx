import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import ProductRail from "@/components/home/ProductRail";
import ReviewsWall from "@/components/home/ReviewsWall";
import WhyViora from "@/components/home/WhyViora";
import ContactLink from "@/components/contact/ContactLink";
import { BRAND_NOTE } from "@/data/homeAssets";
import { loadAboutData } from "@/lib/aboutData";
import { COD_CHARGE, PREPAID_DISCOUNT } from "@/lib/checkoutPricing";
import { whatsappLink } from "@/lib/contact";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Viora Jewel is a Kolkata-based brand of diamond-style necklace sets and earrings — brass with rhodium plating and glass stones, hand-checked before dispatch. COD across India.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Viora Jewel",
    description: "Diamond-style necklace sets and earrings, hand-checked and packed in Kolkata.",
    url: "/about",
  },
};

// Keep every line in step with the shipping and exchange policies and the FAQ.
const PROMISES = [
  {
    title: "Delivery",
    body: `FREE when you pay online (plus ₹${PREPAID_DISCOUNT} off), or ₹${COD_CHARGE} with cash on delivery. Order before 8 pm and it ships the same day (Mon–Sat), then usually 5–7 business days to arrive.`,
    href: "/shipping-policy",
    link: "Shipping policy",
  },
  {
    title: "Exchanges",
    body: "Damaged, wrong or missing parts? Tell us within 48 hours of delivery with a photo and we'll exchange it. We don't exchange for change of mind, and we don't do refunds — if a replacement isn't available, you get store credit.",
    href: "/exchange-policy",
    link: "Exchange policy",
  },
  {
    title: "What it's made of",
    body: "Brass with rhodium plating and glass stones. It's fashion jewellery — not gold, not silver — and the shine typically lasts 1.5–2 years with simple care.",
  },
  {
    title: "Payments",
    body: "UPI, cards and more through Razorpay, or cash on delivery anywhere we ship in India.",
  },
];

/** Who Viora is, in facts a first-time buyer can check: real pieces, real reviews, real policies, a real address. */
const AboutPage = async () => {
  const data = await loadAboutData();
  const numbers = [
    data.delivered && { value: `${data.delivered.toLocaleString("en-IN")}+`, label: "orders delivered" },
    data.cities && { value: `${data.cities}+`, label: "cities delivered to" },
    data.reviews && { value: `${data.reviews.average.toFixed(1)}★`, label: `from ${data.reviews.count} reviews` },
    data.designCount > 0 && { value: String(data.designCount), label: "designs in stock now" },
  ].filter((n): n is { value: string; label: string } => !!n);

  return (
    <div className="bg-platinum text-primary">
      <section className="grid bg-white md:grid-cols-2">
        <div className="relative aspect-[4/3] w-full bg-platinum md:aspect-auto md:min-h-[560px]">
          <Image
            src={BRAND_NOTE.aboutHero.src || data.heroImage || "/about-us-optimized.jpg"}
            alt={BRAND_NOTE.aboutHero.alt}
            fill
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
            style={{ objectPosition: BRAND_NOTE.aboutHero.position }}
          />
        </div>
        <div className="flex flex-col justify-center px-4 py-8 md:px-12 md:py-12 lg:px-16">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-gray-500">
            <Link href="/" className="hover:text-accent">
              Home
            </Link>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-primary">About</span>
          </nav>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-accent">About Viora</p>
          <h1 className="mt-1 font-playfair text-[32px] font-bold leading-tight md:text-5xl">
            Get noticed at every function — without overspending
          </h1>
          <p className="mt-4 text-base leading-relaxed text-gray-700">{BRAND_NOTE.story}</p>
          <ul className="mt-5 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {[
              "📍 Packed and shipped from Kolkata",
              data.designCount && data.fromPrice
                ? `💎 ${data.designCount} designs from ₹${data.fromPrice}`
                : "💎 Diamond-style sets and earrings",
              "🚚 Cash on delivery across India",
              "🔁 48-hour exchange on damaged pieces",
            ].map((fact) => (
              <li key={fact} className="bg-platinum px-3 py-2">
                {fact}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/list?cat=best-sellers#product-grid"
              className="inline-flex h-12 items-center bg-accent px-6 text-sm font-bold uppercase tracking-wider text-white hover:bg-[#7d1527]"
            >
              Shop best sellers
            </Link>
            <ContactLink
              href={whatsappLink("Hi Viora, I have a question")}
              external
              className="inline-flex h-12 items-center border border-primary px-6 text-sm font-bold uppercase tracking-wider text-primary hover:bg-primary hover:text-white"
            >
              WhatsApp us
            </ContactLink>
          </div>
        </div>
      </section>

      {/* Only once real delivery numbers qualify — reviews alone already show in the reviews wall. */}
      {(data.delivered || data.cities) && numbers.length >= 2 && (
        <section aria-label="Viora in numbers" className="border-y border-silver-light bg-platinum px-4 py-8 md:px-6 lg:px-8">
          <ul className={`grid gap-4 text-center ${numbers.length >= 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3"}`}>
            {numbers.map((n) => (
              <li key={n.label}>
                <p className="font-playfair text-3xl font-bold md:text-4xl">{n.value}</p>
                <p className="text-xs text-gray-600 md:text-sm">{n.label}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <WhyViora productImages={data.productImages} />

      <ReviewsWall summary={data.reviews} />

      <section aria-labelledby="promises-title" className="px-4 py-10 md:px-6 md:py-14 lg:px-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Before you order</p>
        <h2 id="promises-title" className="mt-1 font-playfair text-3xl font-bold md:text-4xl">
          What we promise — in plain words
        </h2>
        <ul className="mt-6 grid gap-3 md:grid-cols-2 md:gap-5">
          {PROMISES.map((p) => (
            <li key={p.title} className="border border-silver-light bg-white p-5">
              <h3 className="font-inter font-semibold">{p.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">{p.body}</p>
              {p.href && (
                <Link href={p.href} className="mt-2 inline-block text-sm font-semibold text-accent underline-offset-4 hover:underline">
                  {p.link} →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      <ProductRail
        id="about-best-sellers"
        eyebrow="Where most people start"
        title="Our best sellers"
        viewAllHref="/list?cat=best-sellers#product-grid"
        items={data.bestSellers}
        tone="white"
      />

      <section aria-labelledby="talk-title" className="bg-primary px-4 py-10 text-white md:px-6 md:py-14 lg:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 id="talk-title" className="font-playfair text-3xl font-bold md:text-4xl">
              Questions before you buy?
            </h2>
            <p className="mt-1 text-sm text-white/75">
              Ask about a piece, a colour or your order — we&apos;re on WhatsApp at +91 89103 50623.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ContactLink
              href={whatsappLink("Hi Viora, I have a question")}
              external
              className="inline-flex h-12 items-center bg-white px-6 text-sm font-bold uppercase tracking-wider text-primary hover:bg-platinum"
            >
              Chat on WhatsApp
            </ContactLink>
            <Link
              href="/contact"
              className="inline-flex h-12 items-center border border-white/60 px-6 text-sm font-bold uppercase tracking-wider text-white hover:bg-white/10"
            >
              All contact options
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AboutPage;
