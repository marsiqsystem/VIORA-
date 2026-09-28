"use client";

import { useEffect, useState } from "react";
import { FESTIVE_COMBO, isFestiveComboLive } from "@/lib/checkoutPricing";

/**
 * The festive combo's real deadline, counting down to FESTIVE_COMBO.endsAt.
 * Renders nothing outside the offer window (and nothing on the server, since it
 * depends on the shopper's clock).
 */
const FestiveCountdown = ({ className = "" }: { className?: string }) => {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (now === null || !isFestiveComboLive(now)) return null;

  const ms = Date.parse(FESTIVE_COMBO.endsAt) - now;
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const left = days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;

  return (
    <p className={`bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-800 ${className}`}>
      🪔 Festive combo: ₹{FESTIVE_COMBO.amount} OFF any 2 pieces · ends in {left}
    </p>
  );
};

export default FestiveCountdown;
