"use client";

import { useEffect } from "react";
import { useWixClient } from "@/hooks/useWixClient";
import { grantLoginBonus } from "@/lib/coinsActions";

// Grants the one-time login bonus to ANY signed-in member on page load — not
// just at the exact sign-in moment. This catches existing members who were
// already logged in before coins went live (their session never re-fires the
// sign-in handler). The grant is idempotent per account (reasonKey
// "signup:<contactId>"), so it credits the 10 coins exactly once, ever. Checked
// once per browser session. No-op for guests / when the program is off.
const COINS_UI = process.env.NEXT_PUBLIC_COINS_ENABLED === "1";
const KEY = "viora_login_bonus_checked";

export default function CoinsAutoGrant() {
  const wixClient = useWixClient();

  useEffect(() => {
    if (!COINS_UI) return;
    try {
      if (!wixClient.auth.loggedIn()) return;
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
    } catch {
      return;
    }
    grantLoginBonus()
      .then((r) => {
        // Newly credited → nudge the balance pill + congrats popup to refresh.
        if (r && r.coinsEarned > 0) {
          window.dispatchEvent(new CustomEvent("viora:coins-check"));
        }
      })
      .catch(() => {});
  }, [wixClient]);

  return null;
}
