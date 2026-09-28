"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CLUB_VIORA_MINIMUM,
  CLUB_VIORA_PERCENT,
  CLUB_VIORA_PLUS_MINIMUM,
  CLUB_VIORA_PLUS_PERCENT,
  FESTIVE_COMBO,
  PREPAID_DISCOUNT,
  isFestiveComboLive,
} from "@/lib/checkoutPricing";

const ROTATE_MS = 4000;

/**
 * One short, complete offer at a time instead of a scrolling marquee (on a phone
 * the marquee only ever showed fragments). The ladder rewards apply in the bag
 * automatically, so no codes are shown here.
 */
const AnnouncementBar = () => {
  const [festive, setFestive] = useState(false);
  const [index, setIndex] = useState(0);

  const messages = [
    ...(festive ? [`🪔 ₹${FESTIVE_COMBO.amount} OFF any 2 pieces · till ${FESTIVE_COMBO.endLabel}`] : []),
    `Pay online: FREE delivery + ₹${PREPAID_DISCOUNT} OFF`,
    `${CLUB_VIORA_PERCENT}% OFF on ₹${CLUB_VIORA_MINIMUM}+ · no code needed`,
    `${CLUB_VIORA_PLUS_PERCENT}% OFF on ₹${CLUB_VIORA_PLUS_MINIMUM.toLocaleString("en-IN")}+`,
    "Cash on Delivery available",
  ];

  useEffect(() => {
    setFestive(isFestiveComboLive());
    const timer = window.setInterval(() => setIndex((i) => i + 1), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, []);

  const current = messages[index % messages.length];

  return (
    <div className="relative w-full bg-[#9B1B30] text-white">
      <Link
        href="/list"
        className="flex h-8 items-center justify-center px-4 text-center text-xs font-semibold tracking-wide"
        aria-label={messages.join(". ")}
      >
        <span key={current} className="truncate motion-safe:animate-fade-in" aria-hidden="true">
          {current}
        </span>
      </Link>
    </div>
  );
};

export default AnnouncementBar;
