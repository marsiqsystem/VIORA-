"use client";

// GA4 ecommerce bridge.
//
// Viora's analytics is CODE-BASED gtag (loaded in layout.tsx), NOT GTM — so GA4
// only ever receives the events we explicitly send. `page_view` (automatic) and
// `purchase` were already covered, but the funnel middle — view_item,
// add_to_cart, begin_checkout — was never emitted, which is why GA4 Funnel
// Exploration showed 0 users for those steps.
//
// Rather than sprinkle gtag calls across a dozen components, we hook the single
// choke point every ecommerce signal already flows through: trackMetaEvent().
// Here we translate our existing Meta event payload into GA4's recommended
// ecommerce shape and push it via gtag, targeted at GA4 only.
//
// `purchase` is deliberately NOT mapped here — it already reaches GA4 through a
// separate path, and emitting a second one would double-count revenue.

import type { MetaCustomData, MetaEventName } from "@/lib/metaEvents";

const GA4_ID = "G-2PY7N0E5WE";

// Meta standard event -> GA4 recommended event name.
const GA4_EVENT_BY_META: Partial<Record<MetaEventName, string>> = {
  ViewContent: "view_item",
  AddToCart: "add_to_cart",
  InitiateCheckout: "begin_checkout",
};

type Ga4Item = {
  item_id?: string;
  item_name?: string;
  price?: number;
  quantity?: number;
};

// Build GA4 `items[]` from whatever product detail the Meta payload carried.
// Prefer `contents` (has per-line quantity + price); fall back to `content_ids`.
function toGa4Items(data: MetaCustomData): Ga4Item[] {
  const singleName = data.content_name;
  if (Array.isArray(data.contents) && data.contents.length > 0) {
    const only = data.contents.length === 1;
    return data.contents.map((c) => ({
      item_id: c.id,
      // content_name is one product's name — only meaningful for a single line
      item_name: only ? singleName : undefined,
      price: typeof c.item_price === "number" ? c.item_price : undefined,
      quantity: c.quantity,
    }));
  }
  if (Array.isArray(data.content_ids) && data.content_ids.length > 0) {
    const only = data.content_ids.length === 1;
    return data.content_ids.map((id) => ({
      item_id: id,
      item_name: only ? singleName : undefined,
    }));
  }
  return [];
}

/**
 * Mirror a Meta ecommerce event into GA4 as the equivalent recommended event.
 * No-op on the server, when gtag hasn't loaded, or for events we don't map.
 */
export function trackGa4FromMeta(eventName: MetaEventName, data: MetaCustomData) {
  if (typeof window === "undefined") return;
  const ga4Event = GA4_EVENT_BY_META[eventName];
  if (!ga4Event) return;

  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag !== "function") return;

  gtag("event", ga4Event, {
    send_to: GA4_ID,
    currency: data.currency || "INR",
    ...(typeof data.value === "number" ? { value: data.value } : {}),
    items: toGa4Items(data),
  });
}
