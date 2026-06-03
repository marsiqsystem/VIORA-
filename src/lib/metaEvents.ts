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

const generateEventId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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

/**
 * Fires a Meta event to BOTH the client-side Pixel (fbq) and the server-side
 * Conversions API (`/api/capi`) using a shared `eventID` so Meta can
 * deduplicate the two signals.
 */
export async function trackMetaEvent(
  eventName: MetaEventName,
  customData: MetaCustomData = {}
) {
  if (typeof window === "undefined") return;

  const eventId = generateEventId();

  // Client-side Pixel. Retry briefly because user clicks can happen before
  // fbevents.js has finished replacing the bootstrap stub.
  trackBrowserPixel(eventName, customData, eventId);

  // Server-side Conversions API
  await sendCapiEvent({
    eventName,
    eventId,
    eventSourceUrl: window.location.href,
    customData,
  });
}
