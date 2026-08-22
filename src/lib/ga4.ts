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
// `purchase` is NOT part of the trackMetaEvent bridge below (that maps the funnel
// middle only). Purchase is emitted explicitly via trackGa4Purchase() from the
// success page — see that function. GA4 de-dupes purchase by `transaction_id`, so
// a stray GTM-side purchase can't double-count revenue against it.

import type { MetaCustomData, MetaEventName } from "@/lib/metaEvents";

// Both GA4 properties this site feeds: the code-based one (G-2PY7N0E5WE) and the
// one linked through the GT-T8ZJVVT9 Google Tag (G-69BB087ZMC) — the latter is
// where `purchase` already lands. Send ecommerce events to BOTH so the funnel is
// complete in whichever property marketing actually opens, no guessing required.
const GA4_IDS = ["G-2PY7N0E5WE", "G-69BB087ZMC"];

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
 *
 * `override` lets a caller pin an explicit GA4 event name (or skip GA4 with
 * `null`). We use it so the checkout-SUBMIT stage — which reuses Meta's
 * InitiateCheckout — maps to GA4 `add_payment_info` instead of a second
 * `begin_checkout`. Without this, one purchase journey fires begin_checkout
 * twice (open + submit), making begin_checkout out-count add_to_cart.
 */
export function trackGa4FromMeta(
  eventName: MetaEventName,
  data: MetaCustomData,
  override?: string | null
) {
  if (typeof window === "undefined") return;
  if (override === null) return; // caller explicitly suppressed the GA4 mirror
  const ga4Event = override || GA4_EVENT_BY_META[eventName];
  if (!ga4Event) return;

  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag !== "function") return;

  const payload = {
    currency: data.currency || "INR",
    ...(typeof data.value === "number" ? { value: data.value } : {}),
    items: toGa4Items(data),
  };
  // Fire once per property so each GA4 destination gets its own scoped event.
  for (const id of GA4_IDS) {
    gtag("event", ga4Event, { send_to: id, ...payload });
  }
}

/**
 * Emit the GA4 `purchase` recommended event to every GA4 property. Called once
 * from the success page. GA4 de-duplicates purchase by `transaction_id`, so
 * passing the order id makes a repeat (reload, or a GTM-side purchase) harmless.
 * No-op on the server or before gtag has loaded.
 */
export function trackGa4Purchase(args: {
  transactionId: string;
  value?: number;
  currency?: string;
  contentIds?: string[];
}) {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag !== "function") return;

  const items: Ga4Item[] = Array.isArray(args.contentIds)
    ? args.contentIds.map((id) => ({ item_id: id }))
    : [];

  const payload = {
    transaction_id: args.transactionId,
    currency: args.currency || "INR",
    ...(typeof args.value === "number" ? { value: args.value } : {}),
    items,
  };
  for (const id of GA4_IDS) {
    gtag("event", "purchase", { send_to: id, ...payload });
  }
}
