"use client";

import { trackMetaEvent, type MetaEventName } from "@/lib/metaEvents";

export interface ContentParams {
  content_ids?: string[];
  content_name?: string;
  content_type?: string;
  value?: number;
  currency?: string;
}

export interface PurchaseParams {
  value: number;
  currency: string;
  content_ids?: string[];
  transaction_id?: string;
}

export interface InitiateCheckoutParams {
  value: number;
  currency: string;
  num_items?: number;
}

const isPixelReady = (): boolean => {
  return typeof window !== "undefined" && typeof window.fbq === "function";
};

const safeTrack = (event: string, params?: Record<string, unknown>): void => {
  if (!isPixelReady()) return;
  try {
    window.fbq?.("track", event, params || {});
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`Meta Pixel ${event} failed:`, err);
    }
  }
};

const safeTrackMeta = (
  event: MetaEventName,
  params?: Record<string, unknown>
): void => {
  void trackMetaEvent(event, params || {});
};

export const trackSearch = (search_string: string): void => {
  safeTrackMeta("Search", { search_string });
};

export const trackViewContent = (
  content_ids: string[],
  content_name?: string,
  value?: number,
  currency: string = "INR"
): void => {
  safeTrackMeta("ViewContent", {
    content_ids,
    content_name,
    content_type: "product",
    value,
    currency,
  });
};

export const trackAddToWishlist = (
  content_ids: string[],
  content_name?: string,
  value?: number,
  currency: string = "INR"
): void => {
  safeTrackMeta("AddToWishlist", {
    content_ids,
    content_name,
    content_type: "product",
    value,
    currency,
  });
};

export const trackAddToCart = (
  content_ids: string[],
  content_name?: string,
  value?: number,
  currency: string = "INR"
): void => {
  safeTrackMeta("AddToCart", {
    content_ids,
    content_name,
    content_type: "product",
    value,
    currency,
  });
};

export const trackInitiateCheckout = (
  value: number,
  currency: string = "INR",
  num_items?: number
): void => {
  safeTrackMeta("InitiateCheckout", { value, currency, num_items });
};

export const trackAddPaymentInfo = (
  value: number,
  currency: string = "INR"
): void => {
  safeTrackMeta("AddPaymentInfo", { value, currency });
};

export const trackPurchase = (
  value: number,
  currency: string,
  content_ids?: string[],
  transaction_id?: string
): void => {
  safeTrackMeta("Purchase", {
    value,
    currency,
    content_ids,
    content_type: "product",
    transaction_id,
  });
};

export const trackCompleteRegistration = (method?: string): void => {
  safeTrackMeta("CompleteRegistration", method ? { method } : undefined);
};

export const trackSubscribe = (currency: string = "INR", value: number = 0): void => {
  safeTrackMeta("Subscribe", { currency, value });
};

export const trackContact = (): void => {
  safeTrackMeta("Contact");
};

export const trackLead = (): void => {
  safeTrackMeta("Lead");
};
