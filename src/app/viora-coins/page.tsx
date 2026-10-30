import type { Metadata } from "next";
import Link from "next/link";
import { VIORA_COINS } from "@/lib/checkoutPricing";
import CoinBalanceBadge from "@/components/CoinBalanceBadge";
import { getEarnStatus } from "@/lib/coinsActions";

export const metadata: Metadata = {
  title: "Viora Coins — Earn & Save | Viora",
  description:
    "Earn Viora Coins on reviews, logins and orders. 1 coin = ₹1, never expires, and auto-usable at checkout for money off your next order.",
};

// Read the signed-in member's claim status per request.
export const dynamic = "force-dynamic";

const ways = [
  {
    icon: "📸",
    coins: VIORA_COINS.review,
    en: "Leave a photo review of your Viora jewellery on our website (once per account).",
    hi: "(Hamari website pe apni Viora jewellery ka photo review daalo — ek account pe ek baar.)",
    cta: { label: "Write a review", href: "/account/orders" },
    claim: "review" as const,
    claimedLabel: "Review done",
  },
  {
    icon: "🔐",
    coins: VIORA_COINS.signup,
    en: "Sign in to your Viora account for the first time.",
    hi: "(Viora account me pehli baar log in karo.)",
    cta: { label: "Sign in", href: "/login" },
    claim: "login" as const,
    claimedLabel: "Signed in",
  },
  {
    icon: "💳",
    coins: VIORA_COINS.prepaid,
    en: "Place a prepaid (pay-online) order — credited when the order is successful.",
    hi: "(Prepaid / online-payment order karo — order success hote hi coins mil jaate hain.)",
    cta: { label: "Shop & pay online", href: "/products" },
    claim: null,
    claimedLabel: "",
  },
  {
    icon: "📦",
    coins: VIORA_COINS.codDelivered,
    en: "Get a COD order delivered to you — credited when it's delivered.",
    hi: "(COD order deliver hone pe — jaise hi parcel deliver hoga, coins mil jaate hain.)",
    cta: { label: "Shop now", href: "/products" },
    claim: null,
    claimedLabel: "",
  },
];

export default async function VioraCoinsPage() {
  const status = await getEarnStatus().catch(() => ({
    loggedIn: false,
    balance: 0,
    loginClaimed: false,
    reviewClaimed: false,
  }));
  const isClaimed = (claim: "review" | "login" | null) =>
    claim === "review" ? status.reviewClaimed : claim === "login" ? status.loginClaimed : false;
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
            className="flex flex-col gap-3 rounded-[14px] border border-[#E7DFD2] bg-[#FFFDF9] p-4 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="flex flex-1 items-start gap-3">
              <div className="text-[28px] leading-none">{w.icon}</div>
              <div className="flex-1">
                <span className="mb-1.5 inline-block rounded-full bg-[#1E1B16] px-2.5 py-0.5 text-[13px] font-bold text-[#F6D58A]">
                  + {w.coins} coins
                </span>
                <p className="mb-0.5 text-[14.5px] font-medium text-[#2A251E]">{w.en}</p>
                <p className="text-[12.5px] text-[#9A8E7D]">{w.hi}</p>
              </div>
            </div>
            {isClaimed(w.claim) ? (
              <span className="flex shrink-0 items-center justify-center gap-1.5 self-stretch whitespace-nowrap rounded-full border border-green-600 bg-green-50 px-4 py-2.5 text-center text-[13px] font-bold text-green-700 sm:self-center">
                ✓ {w.claimedLabel}
              </span>
            ) : (
              <Link
                href={w.cta.href}
                className="shrink-0 self-stretch whitespace-nowrap rounded-full border border-[#B8945A] bg-gradient-to-b from-[#E8D5A6] to-[#C9A66B] px-4 py-2.5 text-center text-[13px] font-bold text-[#1A1410] shadow-[0_2px_8px_rgba(201,166,107,0.35)] sm:self-center"
              >
                {w.cta.label} →
              </Link>
            )}
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
