"use client";

import { useEffect, useState } from "react";
import { getCoinBalance } from "@/lib/coinsActions";
import { useWixClient } from "@/hooks/useWixClient";

// Shows the signed-in customer's live Viora Coins balance. A guest is invited to
// sign in; a signed-in member with 0 coins is invited to shop/earn (never told to
// "sign in" when they already are). Client-only.
export default function CoinBalanceBadge() {
  const wixClient = useWixClient();
  const [balance, setBalance] = useState<number | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    try {
      setLoggedIn(wixClient.auth.loggedIn());
    } catch {}
    let cancelled = false;
    (async () => {
      try {
        const b = await getCoinBalance();
        if (!cancelled) setBalance(Number(b) || 0);
      } catch {
        if (!cancelled) setBalance(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wixClient]);

  if (balance === null) return null;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        background: "#1E1B16",
        color: "#fff",
        borderRadius: 999,
        padding: "10px 20px",
        fontSize: 15,
        fontWeight: 600,
      }}
    >
      <span style={{ fontSize: 20 }}>🪙</span>
      {balance > 0 ? (
        <span>
          Your balance: <b style={{ color: "#F6D58A" }}>{balance} coins</b> (₹{balance})
        </span>
      ) : loggedIn ? (
        <span style={{ fontWeight: 500 }}>Shop &amp; review to start earning coins</span>
      ) : (
        <span style={{ fontWeight: 500 }}>Sign in &amp; shop to start earning coins</span>
      )}
    </div>
  );
}
