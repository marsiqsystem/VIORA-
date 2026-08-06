"use client";

export type MetaEventName =
  | "ViewContent"
  | "AddToCart"
  | "AddToWishlist"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "Purchase"
  | "CustomizeProduct"
  | "Search"
  | "CompleteRegistration"
  | "Subscribe"
  | "Contact"
  | "Lead";

export type MetaCustomData = {
  currency?: string;
  value?: number;
  content_ids?: string[];
  content_name?: string;
  content_type?: string;
  contents?: Array<{ id: string; quantity: number; item_price?: number }>;
  num_items?: number;
  search_string?: string;
  transaction_id?: string;
  method?: string;
};

export type MetaUserData = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
};

// Cookie-consent gate. Meta Pixel + Conversions API are ADVERTISING tools.
// Mirrors the storage ConsentManager writes ("viora_consent_v1").
const CONSENT_STORAGE_KEY = "viora_consent_v1";

/**
 * OPT-OUT model (default ON): marketing tracking is allowed unless the visitor
 * has EXPLICITLY declined it (clicked "Reject all", or unticked Marketing in
 * Customize). A visitor who hasn't chosen yet is tracked — the banner is still
 * shown and they can opt out anytime. This maximises conversion coverage for
 * ad optimisation (common practice for India / DPDP); flip back to opt-in by
 * returning false when no choice has been made.
 */
export function hasMarketingConsent(): boolean {
  if (typeof window === "undefined") return false; // SSR — client re-checks
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return true; // no choice yet -> default ON
    const c = JSON.parse(raw) as { marketing?: boolean };
    return c?.marketing !== false; // only OFF when explicitly declined
  } catch {
    return true; // storage unreadable -> default ON
  }
}

const generateEventId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

// Stable anonymous client identifier. Persisted in localStorage so the same
// visitor — even when not logged in — produces the same external_id across
// sessions. Sent on every CAPI event so Meta can match/dedupe without needing
// email or phone for anonymous browsers.
const EXTERNAL_ID_KEY = "viora_meta_external_id";

const getOrCreateExternalId = (): string | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    let id = window.localStorage.getItem(EXTERNAL_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      window.localStorage.setItem(EXTERNAL_ID_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
};

const trackBrowserPixel = (
  eventName: MetaEventName,
  customData: MetaCustomData,
  eventId: string,
  attemptsLeft = 8
) => {
  if (typeof window === "undefined") return;

  if (typeof window.fbq === "function") {
    window.fbq("track", eventName, customData, { eventID: eventId });
    return;
  }

  if (attemptsLeft > 0) {
    window.setTimeout(
      () => trackBrowserPixel(eventName, customData, eventId, attemptsLeft - 1),
      250
    );
  }
};

const sendCapiEvent = (payload: Record<string, unknown>) => {
  const body = JSON.stringify(payload);

  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    const sent = navigator.sendBeacon(
      "/api/capi",
      new Blob([body], { type: "application/json" })
    );
    if (sent) return Promise.resolve();
  }

  return fetch("/api/capi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch((err) => {
    console.warn("Meta CAPI send failed:", err);
  });
};

let clientUserData: MetaUserData | null = null;

export function setMetaUserData(userData: MetaUserData) {
  clientUserData = userData;
  // Store for the Conversions API to pick up (trackMetaEvent reads this and sends
  // it hashed, server-side, on conversion events). We deliberately do NOT re-init
  // the browser pixel with advanced matching — that would attach the email to
  // every browser event (incl. PageView) and trigger Meta's "duplicate emails"
  // warning. Server-side (CAPI) matching is Meta's recommended path anyway.
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem("viora_meta_user_data", JSON.stringify(userData));
    } catch (e) {}
  }
}

/**
 * Fires a Meta event to BOTH the client-side Pixel (fbq) and the server-side
 * Conversions API (`/api/capi`) using a shared `eventID` so Meta can
 * deduplicate the two signals.
 *
 * `explicitEventId` — optional, deterministic id (e.g. `purchase_<orderId>`).
 * Use this when the SAME event is also fired from a different surface (e.g.
 * server-side after order finalize) so Meta can dedupe them properly.
 */
export async function trackMetaEvent(
  eventName: MetaEventName,
  customData: MetaCustomData = {},
  explicitEventId?: string
) {
  if (typeof window === "undefined") return;

  // Consent gate: no Pixel and no CAPI unless the visitor opted into marketing.
  // (The browser Pixel is already gated by fbq not loading, but the server-side
  // CAPI fetch would otherwise fire for everyone — this closes that gap.)
  if (!hasMarketingConsent()) return;

  const eventId = explicitEventId || generateEventId();

  // Client-side Pixel. Retry briefly because user clicks can happen before
  // fbevents.js has finished replacing the bootstrap stub.
  trackBrowserPixel(eventName, customData, eventId);

  // Retrieve saved user data from memory or sessionStorage
  let userData = clientUserData;
  if (!userData) {
    try {
      const stored = window.sessionStorage.getItem("viora_meta_user_data");
      if (stored) {
        userData = JSON.parse(stored);
      }
    } catch (e) {}
  }

  const externalId = getOrCreateExternalId();

  // Server-side Conversions API
  await sendCapiEvent({
    eventName,
    eventId,
    eventSourceUrl: window.location.href,
    customData,
    ...(userData && { userData }),
    ...(externalId && { externalId }),
  });
}
