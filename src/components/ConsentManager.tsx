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

const ConsentManager = () => {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [draft, setDraft] = useState<Consent>({ analytics: true, marketing: true });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Consent;
        setConsent(parsed);
        setDraft(parsed);
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
  const rejectAll = () => persist({ analytics: false, marketing: false });
  const saveCustom = () => persist(draft);

  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <>
      {consent?.marketing && <MetaPixel />}
      {consent?.analytics && <Clarity />}
      {consent?.analytics && gaId && <GoogleAnalytics gaId={gaId} />}

      {showBanner && (
        <div
          role="dialog"
          aria-label="Cookie consent"
          className="fixed inset-x-0 bottom-0 z-[200] border-t border-primary/10 bg-white shadow-2xl max-md:bottom-[64px]"
        >
          <div className="mx-auto max-w-6xl px-4 py-4 md:px-8 md:py-5">
            {!showCustomize ? (
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-gray-700 md:max-w-3xl">
                  <strong className="text-primary">We use cookies.</strong>{" "}
                  Essential cookies keep the site working. With your consent,
                  we also use Google Analytics &amp; Microsoft Clarity to
                  understand usage, and Meta Pixel to measure ads. See our{" "}
                  <a
                    href="/privacy-policy"
                    className="text-accent underline"
                  >
                    Privacy Policy
                  </a>
                  .
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowCustomize(true)}
                    className="rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-white"
                  >
                    Customize
                  </button>
                  <button
                    onClick={rejectAll}
                    className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Reject all
                  </button>
                  <button
                    onClick={acceptAll}
                    className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-primary"
                  >
                    Accept all
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
      )}
    </>
  );
};

export default ConsentManager;
