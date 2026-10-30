"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCoinBalance } from "@/lib/coinsActions";
import { useWixClient } from "@/hooks/useWixClient";

// Compact navbar pill showing the signed-in customer's live Viora Coins balance
// (Amazon/Flipkart style). Shown to any LOGGED-IN member — even at 0, so they
// always know their coins live here; hidden only for guests or when the program
// is off. Tapping it opens the /viora-coins earn-and-spend page. Refreshes on
// mount and when the tab regains focus (e.g. after an order spends coins).
const COINS_UI = process.env.NEXT_PUBLIC_COINS_ENABLED === "1";

export default function NavCoinPill() {
  const wixClient = useWixClient();
  const [balance, setBalance] = useState<number | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!COINS_UI) return;
    try {
      setLoggedIn(wixClient.auth.loggedIn());
    } catch {
      setLoggedIn(false);
    }
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
    const onFocus = () => {
      try {
        setLoggedIn(wixClient.auth.loggedIn());
      } catch {}
      load();
    };
    window.addEventListener("focus", onFocus);
    // Refresh right after a fresh earn (e.g. the login bonus granted this load).
    window.addEventListener("viora:coins-check", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("viora:coins-check", onFocus);
    };
  }, [wixClient]);

  // Only for signed-in members (guests have no wallet). Shown even at 0 coins.
  if (!loggedIn) return null;
  const shown = balance ?? 0;

  return (
    <Link
      href="/viora-coins"
      aria-label={`You have ${shown} Viora Coins — worth ₹${shown}`}
      title={`Your Viora Coins · ₹${shown} off your next order`}
      className="group inline-flex items-center gap-1.5 h-8 md:h-9 pl-1 pr-2.5 md:pr-3 rounded-full border border-[#B8945A] bg-gradient-to-b from-[#E8D5A6] to-[#C9A66B] shadow-[0_2px_8px_rgba(201,166,107,0.45)] transition-all duration-200 hover:brightness-[1.04]"
    >
      <span
        className="flex h-6 w-6 md:h-7 md:w-7 items-center justify-center rounded-full bg-white/70 text-[13px] leading-none shadow-sm"
        aria-hidden
      >
        🪙
      </span>
      <span className="text-[13px] font-bold leading-none text-[#1A1410] tabular-nums">
        {shown}
      </span>
      <span className="hidden text-[13px] font-semibold leading-none text-[#5A4327] lg:inline">
        coins
      </span>
    </Link>
  );
}
