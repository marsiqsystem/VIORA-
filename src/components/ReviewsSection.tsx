"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { format } from "timeago.js";
import ReviewModal from "./ReviewModal";
import type { PublicReview } from "@/lib/reviewsTypes";
import { REVIEW_REWARD } from "@/lib/checkoutPricing";
import { wixThumb } from "@/lib/wixThumb";

type Props = {
  productId?: string;
  productName?: string;
  reviews?: PublicReview[];
};

const Stars = ({ value }: { value: number }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((star) => (
      <svg
        key={star}
        className={`w-4 h-4 ${star <= value ? "text-accent" : "text-gray-200"}`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ))}
  </div>
);

const ReviewsSection = ({ productId, productName, reviews = [] }: Props) => {
  const [open, setOpen] = useState(false);
  const [localReviews, setLocalReviews] = useState<PublicReview[]>(reviews);

  const handleAdded = (review: PublicReview) => {
    setLocalReviews((prev) => [review, ...prev]);
  };

  // A logged-out draft for THIS product may get auto-posted elsewhere (on the
  // next login). Splice it in live so the customer sees it without a reload.
  useEffect(() => {
    if (!productId) return;
    const handler = (e: Event) => {
      const posted = (e as CustomEvent).detail?.posted as
        | { productId: string; review: PublicReview }[]
        | undefined;
      if (!posted) return;
      const mine = posted.filter((p) => p.productId === productId).map((p) => p.review);
      if (mine.length) setLocalReviews((prev) => [...mine, ...prev]);
    };
    window.addEventListener("viora:pending-reviews-flushed", handler);
    return () => window.removeEventListener("viora:pending-reviews-flushed", handler);
  }, [productId]);

  return (
    <div id="reviews" className="scroll-mt-24">
      <details className="group" open>
        <summary className="flex items-center justify-between cursor-pointer list-none">
          <h2 className="font-semibold text-lg text-primary font-playfair">
            Customer Reviews {localReviews.length > 0 && (
              <span className="text-gray-400 font-normal text-base">
                ({localReviews.length})
              </span>
            )}
          </h2>
          <svg
            className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>

        <div className="mt-4 space-y-5">
          {localReviews.length === 0 && (
            <p className="text-sm text-gray-600">
              No reviews yet. Bought this piece? Tell other shoppers how it
              looks and feels.
            </p>
          )}

          {localReviews.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-gray-100 bg-platinum/40 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-primary">{r.authorName}</p>
                    <span className="text-xs text-gray-400">
                      · {format(r.createdDate)}
                    </span>
                  </div>
                  <Stars value={r.rating} />
                </div>
                {r.mediaUrl && (
                  <div className="relative w-16 h-16 overflow-hidden flex-shrink-0 border border-gray-200">
                    <Image
                      src={wixThumb(r.mediaUrl, 192) || r.mediaUrl}
                      alt={`${r.authorName}'s photo`}
                      fill
                      sizes="64px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                )}
              </div>
              {r.title && (
                <p className="mt-2 text-sm font-semibold text-primary">
                  {r.title}
                </p>
              )}
              {r.body && (
                <p className="mt-1 text-sm text-gray-600 leading-relaxed">
                  {r.body}
                </p>
              )}
            </div>
          ))}

          <p className="border-l-2 border-accent bg-accent/5 px-3 py-2 text-xs text-primary">
            📸 Bought from Viora? Post a review with a photo and get{" "}
            <b>₹{REVIEW_REWARD.amount} off your next order</b>.
          </p>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border-2 border-accent px-6 py-3 text-sm font-semibold uppercase tracking-wider text-accent transition-colors hover:bg-accent hover:text-white"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add your review
          </button>
        </div>
      </details>

      <ReviewModal
        open={open}
        onClose={() => setOpen(false)}
        productId={productId}
        productName={productName}
        onSubmitted={handleAdded}
      />
    </div>
  );
};

export default ReviewsSection;
