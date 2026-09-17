"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { useWixClient } from "@/hooks/useWixClient";
import { trackCompleteRegistration } from "@/lib/metaPixel";

declare global {
  interface Window {
    google?: any;
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GSI_SRC = "https://accounts.google.com/gsi/client";

/**
 * "Continue with Google" button for the login/register form.
 *
 * Renders Google's official Identity Services button (logo + text, GDPR-safe),
 * which opens the Google account picker on click. The returned credential is
 * exchanged for a Wix member session via /api/auth/google — the same endpoint
 * the site-wide One-Tap prompt uses — then we store the 30-day refresh token
 * and send the customer to `redirectTo`.
 *
 * Renders nothing when the Google client id isn't configured, so email/password
 * still works everywhere.
 */
export default function GoogleSignInButton({
  redirectTo = "/",
  onError,
  onSuccess,
}: {
  redirectTo?: string;
  onError?: (message: string) => void;
  // When provided (e.g. inside the login modal), called after a successful
  // sign-in instead of navigating to `redirectTo`, so the caller can close
  // the modal and refresh in place.
  onSuccess?: () => void;
}) {
  const wixClient = useWixClient();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const handleCredential = useCallback(
    async (response: { credential?: string }) => {
      if (!response?.credential) return;
      setBusy(true);
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
        try {
          trackCompleteRegistration("google");
        } catch {
          /* analytics is best-effort */
        }
        if (onSuccess) {
          onSuccess();
        } else {
          router.push(redirectTo);
        }
      } catch (err) {
        console.warn("[google-signin] sign-in failed:", err);
        setBusy(false);
        onError?.(
          "We couldn't sign you in with Google. Please try again, or use your email and password."
        );
      }
    },
    [wixClient, router, redirectTo, onError, onSuccess]
  );

  useEffect(() => {
    if (!CLIENT_ID) return;

    const render = () => {
      if (!window.google?.accounts?.id || !containerRef.current) return;
      try {
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: handleCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        // Match the button width to the form (Google caps at 400px).
        const width = Math.min(
          400,
          Math.max(200, containerRef.current.offsetWidth || 384)
        );
        containerRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(containerRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "center",
          width,
        });
        setReady(true);
      } catch (err) {
        console.warn("[google-signin] render failed:", err);
      }
    };

    const existing = document.getElementById("google-gsi-script");
    if (existing && window.google?.accounts?.id) {
      render();
      return;
    }
    if (existing) {
      existing.addEventListener("load", render, { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.id = "google-gsi-script";
    s.onload = render;
    s.onerror = () =>
      console.warn("[google-signin] GIS script failed to load");
    document.head.appendChild(s);
  }, [handleCredential]);

  if (!CLIENT_ID) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative min-h-[44px]">
        {/* Google renders its official button here */}
        <div ref={containerRef} className="flex justify-center" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg border border-silver-light/40 bg-white text-sm font-medium text-gray-500">
            Loading Google sign-in…
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/80 text-sm font-medium text-gray-600">
            Signing you in…
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-gray-400">
        <span className="h-px flex-1 bg-silver-light/50" />
        <span>or</span>
        <span className="h-px flex-1 bg-silver-light/50" />
      </div>
    </div>
  );
}
