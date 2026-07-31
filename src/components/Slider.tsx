"use client";

import Image from "next/image";
import Link from "next/link";

// Rakhi 2026 promotional hero. The desktop (2089x753) and mobile (941x1672)
// artwork already contain all the copy, the ₹899 combo CTA, and the trust
// badges, so we display each banner FULL and uncropped (no text overlay that
// would clash) and let the whole thing link to the shop. Desktop art shows on
// md+; mobile art shows below md.
const Slider = () => {
  return (
    <section className="w-full bg-platinum">
      <Link href="/list?cat=rakhi-special#product-grid" aria-label="Shop the Viora Jewels Rakhi Special collection">
        {/* Desktop / tablet */}
        <Image
          src="/hero-rakhi-desktop.png"
          alt="Happy Rakhi — Viora Jewels exclusive Rakhi Combo at ₹899"
          width={2089}
          height={753}
          sizes="100vw"
          quality={85}
          priority
          fetchPriority="high"
          className="hidden h-auto w-full md:block"
        />
        {/* Mobile */}
        <Image
          src="/hero-rakhi-mobile.png"
          alt="Happy Rakhi — Viora Jewels exclusive Rakhi Combo at ₹899"
          width={941}
          height={1672}
          sizes="100vw"
          quality={85}
          priority
          fetchPriority="high"
          className="block h-auto w-full md:hidden"
        />
      </Link>
    </section>
  );
};

export default Slider;
