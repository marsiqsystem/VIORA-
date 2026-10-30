"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { takeCoinPopup } from "@/lib/coinsActions";

// Shows a celebratory popup whenever the signed-in customer has newly-earned
// Viora Coins they haven't seen yet — covers EVERY earn path (review, first
// login, a prepaid order, a COD order being delivered). The server queues an
// "unseen" note on each earn; this pops + clears it on the next page the
// customer opens. No-op (returns 0) for guests and while COINS_ENABLED is off,
// so it is safe to mount globally. Checked once per mount.
export default function CoinsCongratsPopup() {
  const [coins, setCoins] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await takeCoinPopup();
        if (!cancelled && res?.total > 0) {
          setCoins(res.total);
          setOpen(true);
        }
      } catch {
        /* never block the page */
      }
    };
    check();
    // Re-check when a fresh earn happens in-session (e.g. the login bonus granted
    // on this page load, or coins earned via another flow).
    const onCheck = () => check();
    window.addEventListener("viora:coins-check", onCheck);
    return () => {
      cancelled = true;
      window.removeEventListener("viora:coins-check", onCheck);
    };
  }, []);

  if (!open || coins <= 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="You earned Viora Coins"
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(20,18,16,0.55)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          background: "#FFFDF9",
          border: "1px solid #E7DFD2",
          borderRadius: 16,
          padding: "28px 24px",
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          fontFamily: "inherit",
        }}
      >
        <div style={{ fontSize: 44, lineHeight: 1 }}>🪙</div>
        <h2 style={{ margin: "14px 0 4px", fontSize: 22, fontWeight: 700, color: "#1E1B16" }}>
          You earned {coins} Viora Coins!
        </h2>
        <p style={{ margin: "0 0 4px", fontSize: 15, color: "#5B5247" }}>
          Use them for <b>₹{coins} off</b> your next order with us.
        </p>
        <p style={{ margin: "0 0 20px", fontSize: 12.5, color: "#9A8E7D" }}>
          (1 coin = ₹1 · never expires)
        </p>
        <button
          onClick={() => setOpen(false)}
          style={{
            width: "100%",
            padding: "12px 16px",
            background: "#1E1B16",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Awesome!
        </button>
        <Link
          href="/viora-coins"
          onClick={() => setOpen(false)}
          style={{
            display: "inline-block",
            marginTop: 12,
            fontSize: 13,
            color: "#8A6D3B",
            textDecoration: "underline",
          }}
        >
          How to earn more coins →
        </Link>
      </div>
    </div>
  );
}
