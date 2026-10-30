"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCoinBalance } from "@/lib/coinsActions";

// Compact navbar pill showing the signed-in customer's live Viora Coins balance
// (Amazon/Flipkart style). Hidden for guests, when the program is off, or when
// the balance is 0 — so the navbar stays clean until there's something to show.
// Tapping it opens the /viora-coins earn-and-spend page. Refreshes on mount and
// whenever the tab regains focus (e.g. after placing an order that spends coins).
export default function NavCoinPill() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const b = await getCoinBalance();
        if (!cancelled) setBalance(Number(b) || 0);
      } catch {
        if (!cancelled) setBalance(0);
      }
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Nothing to show for guests / zero balance.
  if (!balance || balance <= 0) return null;

  return (
    <Link
      href="/viora-coins"
      aria-label={`You have ${balance} Viora Coins — worth ₹${balance}`}
      title={`Your Viora Coins · ₹${balance} off your next order`}
      className="group inline-flex items-center gap-1.5 h-8 md:h-9 pl-1 pr-2.5 md:pr-3 rounded-full border border-[#B8945A] bg-gradient-to-b from-[#E8D5A6] to-[#C9A66B] shadow-[0_2px_8px_rgba(201,166,107,0.45)] transition-all duration-200 hover:brightness-[1.04]"
    >
      <span
        className="flex h-6 w-6 md:h-7 md:w-7 items-center justify-center rounded-full bg-white/70 text-[13px] leading-none shadow-sm"
        aria-hidden
      >
        🪙
      </span>
      <span className="text-[13px] font-bold leading-none text-[#1A1410] tabular-nums">
        {balance}
      </span>
      <span className="hidden text-[13px] font-semibold leading-none text-[#5A4327] lg:inline">
        coins
      </span>
    </Link>
  );
}
