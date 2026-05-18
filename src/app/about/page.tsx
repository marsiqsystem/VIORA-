import React from "react";
import Image from "next/image";
import Link from "next/link";

const AboutPage = () => {
  return (
    <div className="min-h-screen bg-platinum">
      <div className="relative h-[56vh] overflow-hidden md:h-[66vh]">
        <Image
          src="/about-us-optimized.jpg"
          alt="Viora Jewels story"
          fill
          sizes="100vw"
          quality={70}
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/35 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center text-center">
          <div className="max-w-3xl px-6">
            <h1 className="mb-6 font-playfair text-5xl font-bold text-white md:text-7xl">
              Our Story
            </h1>
            <p className="text-lg text-white/80 md:text-xl">
              Jewellery for everyday rituals, celebrations, and thoughtful gifts.
            </p>
          </div>
        </div>
      </div>

      <div className="container-responsive py-16 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-6 font-playfair text-4xl font-bold text-primary md:text-5xl">
            Welcome to Viora Jewels
          </h2>
          <p className="text-lg leading-relaxed text-gray-600">
            Viora Jewels is built for shoppers who want beauty without confusion.
            Our pieces are curated to feel polished, gift-ready, and easy to
            style, whether the cart is for a personal treat or a meaningful
            moment.
          </p>
        </div>
      </div>

      <div className="bg-viora-gradient py-16 md:py-24">
        <div className="container-responsive">
          <h2 className="mb-12 text-center font-playfair text-4xl font-bold text-primary">
            What We Stand For
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              ["Considered Design", "Elegant pieces with clean detail, made to work across outfits and occasions."],
              ["Gift-Ready Experience", "Every Viora piece is meticulously crafted and arrives in our signature premium packaging, making it a perfect, unforgettable gift straight out of the box."],
              ["Customer First", "Responsive support, secure payment, and a smoother buying journey from browse to cart."],
            ].map(([title, desc]) => (
              <div
                key={title}
                className="rounded-lg border border-silver-light bg-platinum p-8 shadow-premium transition-all duration-300 hover:-translate-y-1 hover:shadow-premium-hover"
              >
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-lg bg-accent text-white">
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </div>
                <h3 className="mb-3 font-playfair text-2xl font-bold text-primary">
                  {title}
                </h3>
                <p className="text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="container-responsive py-14 md:py-20">
        <div className="grid grid-cols-2 gap-8 text-center md:grid-cols-4">
          {[
            ["10K+", "Happy Customers"],
            ["500+", "Gift-Ready Pieces"],
            ["50+", "Cities Served"],
            ["4.8", "Average Rating"],
          ].map(([stat, label]) => (
            <div className="p-4" key={label}>
              <p className="mb-2 font-playfair text-5xl font-bold text-primary">
                {stat}
              </p>
              <p className="text-gray-600">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-primary py-16 md:py-20">
        <div className="container-responsive text-center">
          <h2 className="mb-6 font-playfair text-4xl font-bold text-white">
            Ready To Find Your Shine?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-white/65">
            Explore pieces made for everyday styling, meaningful gifts, and
            conversion-friendly shopping.
          </p>
          <Link
            href="/list"
            className="inline-flex items-center rounded-full bg-accent px-8 py-4 font-semibold text-white transition-all duration-300 hover:bg-silver hover:text-primary"
          >
            Shop Collection
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
