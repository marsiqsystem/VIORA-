import type { Metadata } from "next";
import Link from "next/link";
import { VIORA_COINS } from "@/lib/checkoutPricing";
import CoinBalanceBadge from "@/components/CoinBalanceBadge";

export const metadata: Metadata = {
  title: "Viora Coins — Earn & Save | Viora",
  description:
    "Earn Viora Coins on reviews, logins and orders. 1 coin = ₹1, never expires, and auto-usable at checkout for money off your next order.",
};

const ways = [
  {
    icon: "📸",
    coins: VIORA_COINS.review,
    en: "Leave a photo review of your Viora jewellery on our website (once per account).",
    hi: "(Hamari website pe apni Viora jewellery ka photo review daalo — ek account pe ek baar.)",
  },
  {
    icon: "🔐",
    coins: VIORA_COINS.signup,
    en: "Sign in to your Viora account for the first time.",
    hi: "(Viora account me pehli baar log in karo.)",
  },
  {
    icon: "💳",
    coins: VIORA_COINS.prepaid,
    en: "Place a prepaid (pay-online) order — credited when the order is successful.",
    hi: "(Prepaid / online-payment order karo — order success hote hi coins mil jaate hain.)",
  },
  {
    icon: "📦",
    coins: VIORA_COINS.codDelivered,
    en: "Get a COD order delivered to you — credited when it's delivered.",
    hi: "(COD order deliver hone pe — jaise hi parcel deliver hoga, coins mil jaate hain.)",
  },
];

export default function VioraCoinsPage() {
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "40px 16px 72px" }}>
      <header style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 52, lineHeight: 1 }}>🪙</div>
        <h1 style={{ margin: "12px 0 6px", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em" }}>
          Viora Coins
        </h1>
        <p style={{ margin: 0, fontSize: 16, color: "#6B6256" }}>
          Earn coins, save money. <b>1 coin = ₹1</b> · never expires.
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9A8E7D" }}>
          (Coins kamao, paise bachao. 1 coin = ₹1, kabhi expire nahi hote.)
        </p>
      </header>

      <div style={{ display: "flex", justifyContent: "center", margin: "18px 0 28px" }}>
        <CoinBalanceBadge />
      </div>

      <h2 style={{ fontSize: 15, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8A6D3B", margin: "0 0 14px" }}>
        Ways to earn coins
      </h2>

      <div style={{ display: "grid", gap: 14 }}>
        {ways.map((w, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
              background: "#FFFDF9",
              border: "1px solid #E7DFD2",
              borderRadius: 14,
              padding: "16px 18px",
            }}
          >
            <div style={{ fontSize: 28, lineHeight: 1 }}>{w.icon}</div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "inline-block",
                  background: "#1E1B16",
                  color: "#F6D58A",
                  fontWeight: 700,
                  fontSize: 13,
                  padding: "3px 10px",
                  borderRadius: 999,
                  marginBottom: 7,
                }}
              >
                + {w.coins} coins
              </div>
              <p style={{ margin: "0 0 3px", fontSize: 14.5, color: "#2A251E", fontWeight: 500 }}>{w.en}</p>
              <p style={{ margin: 0, fontSize: 12.5, color: "#9A8E7D" }}>{w.hi}</p>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 26,
          background: "#F3EEE4",
          borderRadius: 14,
          padding: "16px 18px",
          fontSize: 13.5,
          color: "#5B5247",
          lineHeight: 1.6,
        }}
      >
        <b>How to use:</b> at checkout, tap <b>“Use Viora Coins”</b> and your coins are
        taken off the total automatically. <br />
        <span style={{ color: "#9A8E7D" }}>
          (Checkout pe “Use Viora Coins” pe tap karo — coins apne aap total me se minus ho jaayenge.)
        </span>
      </div>

      <div style={{ textAlign: "center", marginTop: 30 }}>
        <Link
          href="/products"
          style={{
            display: "inline-block",
            padding: "12px 28px",
            background: "#1E1B16",
            color: "#fff",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Shop now →
        </Link>
      </div>
    </main>
  );
}
