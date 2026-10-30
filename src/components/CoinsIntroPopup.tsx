"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWixClient } from "@/hooks/useWixClient";

// "Introducing Viora Coins" — a one-time welcome popup for NEW, logged-out
// visitors. Shows only AFTER the cookie-consent choice is made (so it never
// clashes with the consent banner), only when the coins program is live, and
// never again once dismissed. Logged-in members never see it.
const COINS_UI = process.env.NEXT_PUBLIC_COINS_ENABLED === "1";
const CONSENT_KEY = "viora_consent_v1";
const SEEN_KEY = "viora_coins_intro_v1";

const EARN = [
  { icon: "📸", coins: 75, text: "Photo review of your jewellery" },
  { icon: "🔐", coins: 10, text: "Sign in for the first time" },
  { icon: "💳", coins: 30, text: "Place a prepaid (pay-online) order" },
  { icon: "📦", coins: 20, text: "Get a COD order delivered" },
];

export default function CoinsIntroPopup() {
  const wixClient = useWixClient();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!COINS_UI) return;
    // Never to logged-in members, never twice.
    try {
      if (wixClient.auth.loggedIn()) return;
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      return;
    }

    let shown = false;
    const tryShow = () => {
      if (shown) return;
      try {
        // Only once the visitor has made a cookie-consent choice.
        if (!localStorage.getItem(CONSENT_KEY)) return;
        if (localStorage.getItem(SEEN_KEY)) return;
        if (wixClient.auth.loggedIn()) return;
      } catch {
        return;
      }
      shown = true;
      // A short beat so it lands gently after the banner clears.
      setTimeout(() => setOpen(true), 700);
    };

    tryShow();
    window.addEventListener("viora:consent-set", tryShow);
    return () => window.removeEventListener("viora:consent-set", tryShow);
  }, [wixClient]);

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Introducing Viora Coins"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(26,20,16,0.55)",
        backdropFilter: "blur(2px)",
      }}
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 400,
          background: "#FFFDF9",
          borderRadius: 20,
          padding: "28px 24px 24px",
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(201,166,107,0.45)",
          animation: "coinPop .45s ease-out",
        }}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 12,
            right: 14,
            border: "none",
            background: "transparent",
            fontSize: 20,
            lineHeight: 1,
            color: "#9A8E7D",
            cursor: "pointer",
          }}
        >
          ×
        </button>

        <div
          style={{
            margin: "0 auto 12px",
            width: 60,
            height: 60,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
            background: "linear-gradient(180deg,#E8D5A6,#C9A66B)",
            boxShadow: "0 6px 18px rgba(201,166,107,0.5)",
          }}
        >
          🪙
        </div>

        <h2 style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 800, color: "#1A1410", letterSpacing: "-0.01em" }}>
          Introducing Viora Coins
        </h2>
        <p style={{ margin: "0 0 2px", fontSize: 14, color: "#6B6256" }}>
          Shop with us and get real money off. <b>1 coin = ₹1</b> · never expires.
        </p>
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#9A8E7D" }}>
          (Shopping karo, coins kamao, paise bachao.)
        </p>

        <div style={{ display: "grid", gap: 8, textAlign: "left", marginBottom: 18 }}>
          {EARN.map((e) => (
            <div
              key={e.text}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "#FBF7EC",
                border: "1px solid #E7DFD2",
                borderRadius: 10,
                padding: "8px 11px",
              }}
            >
              <span style={{ fontSize: 17 }}>{e.icon}</span>
              <span style={{ flex: 1, fontSize: 13, color: "#2A251E", fontWeight: 500 }}>{e.text}</span>
              <span
                style={{
                  flexShrink: 0,
                  background: "#1E1B16",
                  color: "#F6D58A",
                  fontWeight: 700,
                  fontSize: 12,
                  padding: "2px 9px",
                  borderRadius: 999,
                }}
              >
                +{e.coins}
              </span>
            </div>
          ))}
        </div>

        <Link
          href="/viora-coins"
          onClick={dismiss}
          style={{
            display: "block",
            padding: "12px 18px",
            background: "linear-gradient(180deg,#D9BE86,#C9A66B)",
            color: "#1A1410",
            border: "1px solid #B8945A",
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 700,
            textDecoration: "none",
            boxShadow: "0 3px 10px rgba(201,166,107,0.45)",
          }}
        >
          Know more →
        </Link>
        <button
          type="button"
          onClick={dismiss}
          style={{
            marginTop: 10,
            border: "none",
            background: "transparent",
            color: "#9A8E7D",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
