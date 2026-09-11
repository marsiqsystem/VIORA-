"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { useEffect, useState } from "react";
import Clarity from "./Clarity";
import MetaPixel from "./MetaPixel";

type Consent = { analytics: boolean; marketing: boolean };
const STORAGE_KEY = "viora_consent_v1";
// Session-only "dismissed via ✕" marker. Hides the banner for the current
// session but is gone next visit, so a dismisser is asked again next time
// (and, because we default to opt-out, tracking keeps running meanwhile).
const DISMISS_KEY = "viora_consent_dismissed";
const REOPEN_EVENT = "viora:reopen-consent";

export const reopenConsentBanner = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(REOPEN_EVENT));
  }
};

const ConsentManager = () => {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [draft, setDraft] = useState<Consent>({ analytics: true, marketing: true });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        // A saved choice (Accept all / Only essential) is permanent — never ask again.
        const parsed = JSON.parse(raw) as Consent;
        setConsent(parsed);
        setDraft(parsed);
      } else if (sessionStorage.getItem(DISMISS_KEY)) {
        // Dismissed with the ✕ earlier this session — stay hidden until next visit.
      } else {
        setShowBanner(true);
      }
    } catch {
      setShowBanner(true);
    }

    const onReopen = () => {
      setShowCustomize(false);
      setShowBanner(true);
    };
    window.addEventListener(REOPEN_EVENT, onReopen);
    return () => window.removeEventListener(REOPEN_EVENT, onReopen);
  }, []);

  // Lock page scroll while the banner is up, so a visitor can't just scroll
  // past it — they have to click Accept all / Only essential / ✕ first.
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
    setShowBanner(false);
    setShowCustomize(false);
  };

  const acceptAll = () => persist({ analytics: true, marketing: true });
  // "Only essential cookies" — the genuine, legal opt-out path (no analytics,
  // no marketing). Positively framed instead of a scary "Reject" button.
  const essentialOnly = () => persist({ analytics: false, marketing: false });
  const saveCustom = () => persist(draft);

  // ✕ = dismiss/close, NOT reject. It saves no consent choice, so under our
  // opt-out default trackers keep running; the banner just hides for this
  // session and returns next visit.
  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setShowBanner(false);
    setShowCustomize(false);
  };

  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  // OPT-OUT model (default ON): load trackers unless the visitor EXPLICITLY
  // declined. `consent === null` = no choice made yet -> still load (the banner
  // is shown so they can opt out). Only a saved `false` turns a tracker off.
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
            visitor makes a choice. Sits just below the banner. */}
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[199] bg-black/40 backdrop-blur-[1px]"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cookie consent"
          className="fixed inset-x-0 bottom-0 z-[200] border-t border-primary/10 bg-white shadow-2xl max-md:bottom-[64px]"
        >
          {/* Small corner ✕ = dismiss/close (not a reject). Discreet but
              visible & accessible, so a visitor can always get past the banner. */}
          <button
            onClick={dismiss}
            aria-label="Close"
            title="Close"
            className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
          </button>
          <div className="mx-auto max-w-6xl px-4 py-4 pr-8 md:px-8 md:py-5">
            {!showCustomize ? (
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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
                  {/* Accept is the primary, most prominent choice. "Only
                      essential" is the genuine (legal) opt-out, styled as a
                      quiet secondary action. No "Reject" label. */}
                  <button
                    onClick={acceptAll}
                    className="order-1 rounded-full bg-accent px-7 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary md:order-2"
                  >
                    Accept all
                  </button>
                  <button
                    onClick={essentialOnly}
                    className="order-2 text-sm font-medium text-gray-500 underline-offset-2 hover:underline md:order-1"
                  >
                    Only essential cookies
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="font-playfair text-xl font-semibold text-primary">
                  Cookie Preferences
                </h3>
                <div className="space-y-3 text-sm text-gray-700">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-primary">Essential</p>
                      <p className="text-gray-600">
                        Cart, login, security. Always on.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-700">
                      Always on
                    </span>
                  </div>
                  <label className="flex cursor-pointer items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-primary">
                        Analytics
                      </p>
                      <p className="text-gray-600">
                        Google Analytics 4 &amp; Microsoft Clarity (heatmaps,
                        session recordings).
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
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    onClick={() => setShowCustomize(false)}
                    className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Back
                  </button>
                  <button
                    onClick={saveCustom}
                    className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-primary"
                  >
                    Save preferences
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        </>
      )}
    </>
  );
};

export default ConsentManager;
