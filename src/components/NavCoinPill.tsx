"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCoinBalance } from "@/lib/coinsActions";
import { useWixClient } from "@/hooks/useWixClient";

// Compact navbar pill for Viora Coins (Amazon/Flipkart style), ALWAYS visible
// (desktop + mobile) whenever the program is on:
//   • logged-in member  -> live balance  "🪙 85 coins"  (even at 0)
//   • guest             -> an invite chip "🪙 Coins"     (taps to learn + sign in)
// So every visitor can see coins exist, tap to learn, and use them — not just
// members. Tapping opens the /viora-coins earn-and-spend page. Refreshes on mount
// and when the tab regains focus (e.g. after an order spends coins).
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

  // Hidden only when the program is off. Members see their balance; guests see an
  // invite chip (no wallet yet) — both always visible on mobile + desktop.
  if (!COINS_UI) return null;
  const isMember = loggedIn === true;
  const shown = balance ?? 0;

  return (
    <Link
      href="/viora-coins"
      aria-label={
        isMember
          ? `You have ${shown} Viora Coins — worth ₹${shown}. Tap to use them.`
          : "Viora Coins — tap to learn how to earn coins and save on your order"
      }
      title={
        isMember
          ? `Your Viora Coins · ₹${shown} off your next order`
          : "Viora Coins · earn coins & get ₹ off your order"
      }
      className="group inline-flex items-center gap-1.5 h-8 md:h-9 pl-1 pr-2.5 md:pr-3 rounded-full border border-[#B8945A] bg-gradient-to-b from-[#E8D5A6] to-[#C9A66B] shadow-[0_2px_8px_rgba(201,166,107,0.45)] transition-all duration-200 hover:brightness-[1.04] animate-[coinPulse_2.8s_ease-in-out_3]"
    >
      <span
        className="flex h-6 w-6 md:h-7 md:w-7 items-center justify-center rounded-full bg-white/70 text-[13px] leading-none shadow-sm"
        aria-hidden
      >
        🪙
      </span>
      {isMember ? (
        <>
          <span className="text-[13px] font-bold leading-none text-[#1A1410] tabular-nums">
            {shown}
          </span>
          <span className="hidden text-[13px] font-semibold leading-none text-[#5A4327] sm:inline">
            coins
          </span>
        </>
      ) : (
        <span className="text-[13px] font-bold leading-none text-[#1A1410]">
          Coins
        </span>
      )}
    </Link>
  );
}
