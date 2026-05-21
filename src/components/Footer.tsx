"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { trackSubscribe, trackLead } from "@/lib/metaPixel";

const Footer = () => {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState("");
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

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || subscribing) return;
    setSubscribeError("");
    setSubscribing(true);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Could not subscribe. Please try again.");
      }
      trackSubscribe("INR", 0);
      trackLead();
      setSubscribed(true);
      setEmail("");
      setTimeout(() => setSubscribed(false), 3000);
    } catch (err: any) {
      setSubscribeError(err?.message || "Could not subscribe. Please try again.");
    } finally {
      setSubscribing(false);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="bg-primary text-white pb-20 md:pb-0 w-full max-w-[100vw] overflow-x-hidden">
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
            <div className="w-full min-w-0 max-w-md md:w-auto">
              <form onSubmit={handleSubscribe} className="flex w-full">
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-w-0 flex-1 rounded-l-lg border border-white/20 bg-white/10 px-3 py-3.5 text-white placeholder:text-white/45 transition-colors focus:border-white/40 focus:outline-none sm:px-5"
                  required
                />
                <button
                  type="submit"
                  disabled={subscribing}
                  className={`shrink-0 rounded-r-lg px-4 py-3.5 text-sm font-semibold transition-all duration-300 sm:px-6 sm:text-base disabled:opacity-70 ${
                    subscribed
                      ? "bg-green-500 text-white"
                      : "bg-accent text-white hover:bg-silver hover:text-primary"
                  }`}
                >
                  {subscribing ? "..." : subscribed ? "Done" : "Subscribe"}
                </button>
              </form>
              {subscribed && (
                <p className="mt-2 text-sm text-green-300">
                  You&apos;re on the list! Check your inbox for Viora updates.
                </p>
              )}
              {subscribeError && (
                <p className="mt-2 text-sm text-red-300">{subscribeError}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container-responsive py-12 md:py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-5 lg:gap-12">
          <div className="col-span-2 md:col-span-1 lg:col-span-2">
            <Link href="/" className="mb-6 inline-block">
              <Image
                src="/logo%20compressed.png"
                alt="Viora Jewels"
                width={300}
                height={108}
                className="h-28 w-auto object-contain brightness-0 invert"
                style={{ width: "auto" }}
              />
            </Link>
            <p className="mb-6 max-w-xs text-sm leading-relaxed text-white/65">
              Viora Jewels creates elegant pieces for everyday shine,
              celebrations, and meaningful moments.
            </p>
            <div className="flex gap-3">
              {[
                ["https://www.facebook.com/profile.php?id=61589962820647", "/facebook.png", "Facebook"],
                ["https://www.instagram.com/_viorajewels_?igsh=bGV3eTFjazIwejNs", "/instagram.png", "Instagram"],
              ].map(([href, src, label]) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition-all duration-300 hover:bg-silver hover:scale-110"
                  aria-label={label}
                  key={label}
                >
                  <Image
                    src={src}
                    alt=""
                    width={18}
                    height={18}
                    className={`h-[18px] w-[18px] object-contain ${
                      label === "Facebook" ? "rounded-sm" : "brightness-0 invert"
                    }`}
                  />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-5 font-playfair text-lg font-semibold text-white">Categories</h4>
            <ul className="space-y-3 text-sm text-white/65">
              <li><Link href="/list" className="hover:text-white">All Jewellery</Link></li>
              <li><Link href="/list?cat=new-arrivals#product-grid" className="hover:text-white">New Arrivals</Link></li>
              <li><Link href="/list?cat=best-sellers#product-grid" className="hover:text-white">Best Sellers</Link></li>
              <li><Link href="/list?cat=gifting#product-grid" className="hover:text-white">Gifting</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-5 font-playfair text-lg font-semibold text-white">Company</h4>
            <ul className="space-y-3 text-sm text-white/65">
              <li><Link href="/about" className="hover:text-white">About Us</Link></li>
              <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
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
              <span>₹ INR</span>
            </div>
            <div className="flex items-center gap-4">
              <Image src="/visa.png" alt="Visa" width={40} height={24} className="h-6 w-auto opacity-70 transition-opacity hover:opacity-100" style={{ width: "auto" }} />
              <Image src="/mastercard.png" alt="Mastercard" width={40} height={24} className="h-6 w-auto opacity-70 transition-opacity hover:opacity-100" style={{ width: "auto" }} />
              <span className="rounded border border-white/20 px-2 py-0.5 text-xs font-semibold text-white/70">UPI</span>
              <span className="rounded border border-white/20 px-2 py-0.5 text-xs font-semibold text-white/70">RuPay</span>
              <span className="rounded border border-white/20 px-2 py-0.5 text-xs font-semibold text-white/70">COD</span>
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
