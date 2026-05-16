"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { trackSubscribe, trackLead } from "@/lib/metaPixel";

const Footer = () => {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setShowBackToTop(window.scrollY > 300);
          ticking = false;
        });
        ticking = true;
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      trackSubscribe("INR", 0);
      trackLead();
      setSubscribed(true);
      setEmail("");
      setTimeout(() => setSubscribed(false), 3000);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="bg-primary text-white pb-20 md:pb-0">
      <div className="border-b border-white/10">
        <div className="container-responsive py-12 md:py-16">
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
            <div className="text-center md:text-left">
              <h3 className="mb-2 font-playfair text-3xl font-bold">
                Join The Viora List
              </h3>
              <p className="text-white/65">
                Early access to new drops, gifting edits, and private offers.
              </p>
            </div>
            <form onSubmit={handleSubscribe} className="flex w-full max-w-md md:w-auto">
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 rounded-l-lg border border-white/20 bg-white/10 px-5 py-3.5 text-white placeholder:text-white/45 transition-colors focus:border-white/40 focus:outline-none"
                required
              />
              <button
                type="submit"
                className={`rounded-r-lg px-6 py-3.5 font-semibold transition-all duration-300 ${
                  subscribed
                    ? "bg-green-500 text-white"
                    : "bg-accent text-white hover:bg-silver hover:text-primary"
                }`}
              >
                {subscribed ? "Done" : "Subscribe"}
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="container-responsive py-12 md:py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-5 lg:gap-12">
          <div className="col-span-2 md:col-span-1 lg:col-span-2">
            <Link href="/" className="mb-6 inline-block">
              <Image
                src="/final%20logo%20copy.png"
                alt="Viora Jewels"
                width={300}
                height={108}
                className="h-28 w-auto object-contain brightness-0 invert"
              />
            </Link>
            <p className="mb-6 max-w-xs text-sm leading-relaxed text-white/65">
              Viora Jewels creates elegant, gift-ready pieces for everyday shine,
              celebrations, and meaningful moments.
            </p>
            <div className="flex gap-3">
              {[
                ["https://www.facebook.com/profile.php?id=61589962820647", "/facebook.png", "Facebook"],
                ["https://www.instagram.com/_viorajewels", "/instagram.png", "Instagram"],
              ].map(([href, src, label]) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition-all duration-300 hover:bg-silver hover:scale-110"
                  aria-label={label}
                  key={label}
                >
                  <Image src={src} alt="" width={18} height={18} className="brightness-0 invert" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-5 font-playfair text-lg font-semibold text-white">Shop</h4>
            <ul className="space-y-3 text-sm text-white/65">
              <li><Link href="/list" className="hover:text-white">All Jewellery</Link></li>
              <li><Link href="/new-arrivals" className="hover:text-white">New Arrivals</Link></li>
              <li><Link href="/list?sort=desc+price" className="hover:text-white">Best Sellers</Link></li>
              <li><Link href="/list" className="hover:text-white">Gifting</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-5 font-playfair text-lg font-semibold text-white">Company</h4>
            <ul className="space-y-3 text-sm text-white/65">
              <li><Link href="/about" className="hover:text-white">About Us</Link></li>
              <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
              <li><Link href="/about" className="hover:text-white">Craft Promise</Link></li>
              <li><Link href="/contact" className="hover:text-white">Bulk Gifting</Link></li>
              <li><Link href="/privacy-policy" className="hover:text-white">Privacy Policy</Link></li>
              <li><Link href="/terms-and-conditions" className="hover:text-white">Terms &amp; Conditions</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-5 font-playfair text-lg font-semibold text-white">Help</h4>
            <ul className="space-y-3 text-sm text-white/65">
              <li><Link href="/contact" className="hover:text-white">Customer Service</Link></li>
              <li><Link href="/profile" className="hover:text-white">My Account</Link></li>
              <li><Link href="/orders" className="hover:text-white">Track Order</Link></li>
              <li><Link href="/shipping-policy" className="hover:text-white">Shipping Policy</Link></li>
              <li><Link href="/exchange-policy" className="hover:text-white">Exchange Policy</Link></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-responsive py-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-4 text-sm text-white/60">
              <span>Copyright 2026 Viora Jewels. All rights reserved.</span>
              <span className="hidden text-white/20 md:inline">|</span>
              <span>Rs. INR</span>
            </div>
            <div className="flex items-center gap-4">
              <Image src="/visa.png" alt="Visa" width={40} height={24} className="opacity-70 transition-opacity hover:opacity-100" />
              <Image src="/mastercard.png" alt="Mastercard" width={40} height={24} className="opacity-70 transition-opacity hover:opacity-100" />
              <Image src="/paypal.png" alt="PayPal" width={40} height={24} className="opacity-70 transition-opacity hover:opacity-100" />
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={scrollToTop}
        aria-hidden={!showBackToTop}
        tabIndex={showBackToTop ? 0 : -1}
        className={`fixed bottom-24 md:bottom-8 right-4 md:right-8 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-premium-hover transition-opacity duration-300 hover:scale-110 hover:bg-silver hover:text-primary ${
          showBackToTop ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-label="Back to top"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      </button>
    </footer>
  );
};

export default Footer;
