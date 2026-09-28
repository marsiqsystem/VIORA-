"use client";

import { useCallback, useEffect, useRef } from "react";
import Cookies from "js-cookie";
import { useWixClient } from "@/hooks/useWixClient";

declare global {
  interface Window {
    google?: any;
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GSI_SRC = "https://accounts.google.com/gsi/client";

/**
 * Google One-Tap sign-in.
 *
 * Shows Google's native one-tap prompt to signed-out visitors. On success it
 * exchanges the Google credential for a Wix member session via /api/auth/google,
 * stores the refresh token (30 days) and reloads so the app picks up the member.
 *
 * Renders nothing. Safe to mount site-wide: it no-ops when the client id is
 * missing or the visitor is already logged in.
 */
export default function GoogleOneTap({
  onLoggedIn,
}: {
  onLoggedIn?: () => void;
}) {
  const wixClient = useWixClient();
  const started = useRef(false);

  const handleCredential = useCallback(
    async (response: { credential?: string }) => {
      if (!response?.credential) return;
      try {
        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: response.credential }),
        });
        if (!res.ok) throw new Error(`auth endpoint ${res.status}`);
        const { tokens } = await res.json();
        if (!tokens?.refreshToken) throw new Error("no tokens returned");
        Cookies.set("refreshToken", JSON.stringify(tokens.refreshToken), {
          expires: 30,
        });
        wixClient.auth.setTokens(tokens);
        onLoggedIn?.();
        window.location.reload();
      } catch (err) {
        console.warn("[google-onetap] sign-in failed:", err);
      }
    },
    [wixClient, onLoggedIn]
  );

  useEffect(() => {
    if (!CLIENT_ID || started.current) return;
    try {
      if (wixClient.auth.loggedIn()) return; // already a member — no prompt
    } catch {
      /* fall through and try prompting */
    }
    started.current = true;

    const init = () => {
      if (!window.google?.accounts?.id) return;
      try {
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: handleCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
        });
        window.google.accounts.id.prompt();
      } catch (err) {
        console.warn("[google-onetap] init failed:", err);
      }
    };

    const existing = document.getElementById("google-gsi-script");
    if (existing) {
      init();
      return;
    }
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.id = "google-gsi-script";
    s.onload = init;
    s.onerror = () => console.warn("[google-onetap] GIS script failed to load");
    document.head.appendChild(s);
  }, [wixClient, handleCredential]);

  return null;
}

/**
 * Manually re-trigger the one-tap prompt (e.g. from a "Continue with Google"
 * button). No-ops if GIS hasn't loaded yet. Returns true if a prompt was asked.
 */
export function promptGoogleOneTap(): boolean {
  if (typeof window === "undefined" || !window.google?.accounts?.id) return false;
  try {
    window.google.accounts.id.prompt();
    return true;
  } catch {
    return false;
  }
}
