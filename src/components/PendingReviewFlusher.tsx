"use client";

import { useEffect } from "react";
import { useWixClient } from "@/hooks/useWixClient";
import { flushPendingReviews, hasPendingReviews } from "@/lib/pendingReviews";

/**
 * Runs once per page load. If the customer is logged in AND has review drafts
 * saved from an earlier logged-out attempt, it posts them automatically. This
 * covers the case where the customer wrote a review, couldn't/didn't log in
 * then, and comes back (even days later) and logs in — their review is posted.
 */
const PendingReviewFlusher = () => {
  const wixClient = useWixClient();

  useEffect(() => {
    try {
      if (!hasPendingReviews()) return;
      if (!wixClient.auth.loggedIn()) return;
      flushPendingReviews().catch(() => {});
    } catch {
      // Never let this break the page.
    }
    // Intentionally run only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

export default PendingReviewFlusher;
