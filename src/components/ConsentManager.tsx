"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { useEffect, useState } from "react";
import Clarity from "./Clarity";
import MetaPixel from "./MetaPixel";

type Consent = { analytics: boolean; marketing: boolean };
const STORAGE_KEY = "viora_consent_v1";
const REOPEN_EVENT = "viora:reopen-consent";

export const reopenConsentBanner = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(REOPEN_EVENT));
  }
};

// Google Consent Mode v2 — push the visitor's real choice to gtag. For a
// visitor who limits tracking (analytics/marketing denied) Google still
// collects cookieless pings and MODELS the conversions, so we recover a large
// share of that data legally instead of losing it entirely.
const updateGoogleConsent = (next: Consent) => {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag !== "function") return;
  gtag("consent", "update", {
    ad_storage: next.marketing ? "granted" : "denied",
    ad_user_data: next.marketing ? "granted" : "denied",
    ad_personalization: next.marketing ? "granted" : "denied",
    analytics_storage: next.analytics ? "granted" : "denied",
  });
};

const ConsentManager = () => {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<Consent>({ analytics: true, marketing: true });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        // A saved choice is permanent — never ask again. Re-affirm it to gtag.
        const parsed = JSON.parse(raw) as Consent;
        setConsent(parsed);
        setDraft(parsed);
        updateGoogleConsent(parsed);
      } else {
        setShowBanner(true);
      }
    } catch {
      setShowBanner(true);
    }

    const onReopen = () => {
      setShowSettings(false);
      setShowBanner(true);
    };
    window.addEventListener(REOPEN_EVENT, onReopen);
    return () => window.removeEventListener(REOPEN_EVENT, onReopen);
  }, []);

  // Lock page scroll while the banner/settings is up, so a visitor can't scroll
  // past it — they must click "Accept all", or open settings and save a choice.
  // There is no ✕: the banner stays until a choice is made.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!showBanner) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showBanner]);

  const persist = (next: Consent) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
    setConsent(next);
    setDraft(next);
    updateGoogleConsent(next);
    setShowBanner(false);
    setShowSettings(false);
  };

  const acceptAll = () => persist({ analytics: true, marketing: true });
  const savePreferences = () => persist(draft);

  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  // OPT-OUT model (default ON): load trackers unless the visitor EXPLICITLY
  // declined a category. `consent === null` = no choice yet -> still load (the
  // banner is shown so they can limit it). Only a saved `false` turns one off.
  const marketingOn = consent ? consent.marketing !== false : true;
  const analyticsOn = consent ? consent.analytics !== false : true;

  return (
    <>
      {marketingOn && <MetaPixel />}
      {analyticsOn && <Clarity />}
      {analyticsOn && gaId && <GoogleAnalytics gaId={gaId} />}

      {showBanner && (
        <>
          {/* Dimming backdrop: blocks scrolling/clicking the page until the
              visitor makes a choice. Sits just below the banner/modal. */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-[199] bg-black/40 backdrop-blur-[1px]"
          />

          {!showSettings ? (
            // ---- Bottom consent banner (no ✕ — stays until a choice is made) ----
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Cookie consent"
              className="fixed inset-x-0 bottom-0 z-[200] border-t border-primary/10 bg-white shadow-2xl max-md:bottom-[64px]"
            >
              <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-8 md:py-5">
                <div className="text-sm text-gray-700 md:max-w-3xl">
                  <strong className="text-primary">
                    We use cookies to make Viora better for you.
                  </strong>{" "}
                  Essential cookies keep the site working. With your consent, we
                  also use analytics &amp; Meta Pixel to understand what you love
                  and show you relevant offers &amp; deals. It helps us improve
                  your experience &mdash; you can change this anytime. See our{" "}
                  <a href="/privacy-policy" className="text-accent underline">
                    Privacy Policy
                  </a>
                  .
                </div>
                <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
                  <button
                    onClick={acceptAll}
                    className="order-1 rounded-full bg-accent px-7 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary md:order-2"
                  >
                    Accept all
                  </button>
                  <button
                    onClick={() => {
                      setDraft(consent ?? { analytics: true, marketing: true });
                      setShowSettings(true);
                    }}
                    className="order-2 text-sm font-medium text-gray-500 underline-offset-2 hover:underline md:order-1"
                  >
                    Cookie settings
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // ---- Centered "Cookie settings" modal ----
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Cookie settings"
              className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            >
              <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                {/* ✕ closes ONLY this settings modal and returns to the bottom
                    banner. The banner itself has no ✕ — it stays until the
                    visitor chooses (Accept all, or saves a choice here). */}
                <button
                  onClick={() => setShowSettings(false)}
                  aria-label="Close settings"
                  title="Close"
                  className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  >
                    <path d="M1 1l10 10M11 1L1 11" />
                  </svg>
                </button>
                <h3 className="font-playfair text-xl font-semibold text-primary">
                  Cookie settings
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  Choose what you&apos;re comfortable with. Essential cookies are
                  always on so the site works.
                </p>

                <div className="mt-4 space-y-3 text-sm text-gray-700">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-primary">Essential</p>
                      <p className="text-gray-600">Cart, login, security.</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-700">
                      Always on
                    </span>
                  </div>

                  <label className="flex cursor-pointer items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-primary">Analytics</p>
                      <p className="text-gray-600">
                        Google Analytics 4 &amp; Microsoft Clarity (understand
                        what visitors love).
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={draft.analytics}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, analytics: e.target.checked }))
                      }
                      className="mt-1 h-5 w-5 accent-accent"
                    />
                  </label>

                  <label className="flex cursor-pointer items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-primary">Marketing</p>
                      <p className="text-gray-600">
                        Meta Pixel &amp; Conversions API for ad measurement.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={draft.marketing}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, marketing: e.target.checked }))
                      }
                      className="mt-1 h-5 w-5 accent-accent"
                    />
                  </label>
                </div>

                <div className="mt-6 flex flex-col gap-2">
                  <button
                    onClick={acceptAll}
                    className="w-full rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary"
                  >
                    Accept all
                  </button>
                  <button
                    onClick={savePreferences}
                    className="w-full rounded-full border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Save my preferences
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default ConsentManager;
