"use client";

export type MetaEventName =
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase"
  | "Search";

export type MetaCustomData = {
  currency?: string;
  value?: number;
  content_ids?: string[];
  content_name?: string;
  content_type?: string;
  contents?: Array<{ id: string; quantity: number; item_price?: number }>;
  num_items?: number;
  search_string?: string;
};

const generateEventId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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

  // Client-side Pixel
  if (window.fbq) {
    window.fbq("track", eventName, customData, { eventID: eventId });
  }

  // Server-side Conversions API
  try {
    await fetch("/api/capi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName,
        eventId,
        eventSourceUrl: window.location.href,
        customData,
      }),
      keepalive: true,
    });
  } catch (err) {
    console.warn("Meta CAPI send failed:", err);
  }
}
