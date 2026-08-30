"use client";

/**
 * Draft reviews written while logged OUT are saved here so they are never lost.
 * The moment the customer logs in — this session, or any future visit on this
 * browser — the draft is auto-posted (see PendingReviewFlusher + ReviewModal).
 *
 * Photos are NOT persisted (they can't survive a browser restart cheaply); a
 * photo only rides along when the customer is already logged in at submit time.
 */

import { createProductReview } from "@/lib/reviewsActions";
import type { PublicReview } from "@/lib/reviewsTypes";

const KEY = "viora_pending_reviews_v1";

export type PendingReview = {
  id: string;
  productId: string;
  productName?: string;
  rating: number;
  title?: string;
  body: string;
  createdAt: number;
};

function read(): PendingReview[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(list: PendingReview[]): void {
  if (typeof window === "undefined") return;
  try {
    if (list.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full / blocked (private mode) — nothing we can do; skip silently.
  }
}

/** Save (or replace) the pending draft for a product. Latest write wins. */
export function savePendingReview(input: {
  productId: string;
  productName?: string;
  rating: number;
  title?: string;
  body: string;
}): void {
  if (!input.productId || !input.body?.trim() || !input.rating) return;
  const list = read().filter((p) => p.productId !== input.productId);
  list.push({
    id: `${input.productId}-${Date.now()}`,
    productId: input.productId,
    productName: input.productName,
    rating: input.rating,
    title: input.title?.trim() || undefined,
    body: input.body.trim(),
    createdAt: Date.now(),
  });
  write(list);
}

export function getPendingReviews(): PendingReview[] {
  return read();
}

export function hasPendingReviews(): boolean {
  return read().length > 0;
}

export function removePendingReviewForProduct(productId: string): void {
  if (!productId) return;
  write(read().filter((p) => p.productId !== productId));
}

// Guard against overlapping flushes (e.g. two tabs, or a re-render race).
let flushing = false;

/**
 * Post every saved draft to Wix. Assumes the caller has verified the customer
 * is logged in. Successfully posted drafts are removed; drafts that still fail
 * with LOGIN_REQUIRED (session not ready) are kept for the next attempt.
 * Broadcasts `viora:pending-reviews-flushed` so any open product page can
 * splice the new review into its list without a reload.
 */
export async function flushPendingReviews(): Promise<PublicReview[]> {
  if (flushing) return [];
  const list = read();
  if (list.length === 0) return [];

  flushing = true;
  const posted: { productId: string; review: PublicReview }[] = [];
  const remaining: PendingReview[] = [];

  try {
    for (const p of list) {
      try {
        const res = await createProductReview({
          productId: p.productId,
          rating: p.rating,
          title: p.title,
          body: p.body,
        });
        if (res.ok) {
          posted.push({ productId: p.productId, review: res.review });
        } else if (res.error === "LOGIN_REQUIRED") {
          // Not actually logged in yet — keep it and stop; nothing else will post.
          remaining.push(p);
        } else if (res.error === "INVALID") {
          // Permanently bad payload — drop it so it can't loop forever.
        } else {
          // Transient server error — keep it for a later retry.
          remaining.push(p);
        }
      } catch {
        remaining.push(p);
      }
    }
  } finally {
    write(remaining);
    flushing = false;
  }

  if (posted.length && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("viora:pending-reviews-flushed", { detail: { posted } })
    );
  }
  return posted.map((x) => x.review);
}
