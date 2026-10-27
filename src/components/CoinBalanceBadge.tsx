"use client";

import { useEffect, useState } from "react";
import { getCoinBalance } from "@/lib/coinsActions";

// Shows the signed-in customer's live Viora Coins balance. For guests / when the
// program is off it reads 0; we then invite them to sign in. Client-only.
export default function CoinBalanceBadge() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
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
  }, []);

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
      ) : (
        <span style={{ fontWeight: 500 }}>Sign in &amp; shop to start earning coins</span>
      )}
    </div>
  );
}
