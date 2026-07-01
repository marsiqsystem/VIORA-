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
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem("viora_meta_user_data", JSON.stringify(userData));
    } catch (e) {}

    const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
    if (pixelId && typeof window.fbq === "function") {
      const metaData: Record<string, string> = {};
      if (userData.email) metaData.em = userData.email.trim().toLowerCase();
      if (userData.phone) {
        let phoneDigits = userData.phone.replace(/[^0-9]/g, "");
        if (phoneDigits.length === 10) {
          phoneDigits = "91" + phoneDigits;
        }
        metaData.ph = phoneDigits;
      }
      if (userData.firstName) metaData.fn = userData.firstName.trim().toLowerCase();
      if (userData.lastName) metaData.ln = userData.lastName.trim().toLowerCase();
      if (userData.city) metaData.ct = userData.city.trim().toLowerCase();
      if (userData.state) metaData.st = userData.state.trim().toLowerCase();
      if (userData.zip) metaData.zp = userData.zip.trim().toLowerCase();
      if (userData.country) metaData.country = userData.country.trim().toLowerCase();

      window.fbq("init", pixelId, metaData);
    }
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
