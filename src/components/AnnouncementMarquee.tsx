"use client";

import React from "react";

const AnnouncementMarquee = () => {
  const items = [
    "🚚 Free Delivery",
    "💳 COD Available",
    "🔄 Easy Exchange",
    "✨ Premium Quality",
    "💸 ₹50 OFF on Prepaid Orders",
    "✨ FLAT ₹50 DISCOUNT on orders above ₹700 (Code: SHINE50) ✨",
  ];

  return (
    <div className="w-full bg-[#9B1B30] text-white overflow-hidden py-2 z-[70] relative">
      <div className="animate-marquee">
        {/* We render the list twice to create a seamless infinite scrolling effect. Since the animation translates by -50%, it will seamlessly loop back to the start. */}
        {[...Array(2)].map((_, i) => (
          <div key={i} className="flex shrink-0 items-center">
            {items.map((item, index) => (
              <span key={`${i}-${index}`} className="flex items-center text-xs font-semibold tracking-wide whitespace-nowrap">
                <span className="mx-6">{item}</span>
                <span className="text-white/40">•</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AnnouncementMarquee;
