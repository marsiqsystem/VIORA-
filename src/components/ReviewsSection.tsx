"use client";

import Image from "next/image";
import { useState } from "react";
import { format } from "timeago.js";
import ReviewModal from "./ReviewModal";
import type { PublicReview } from "@/lib/reviewsTypes";

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

  return (
    <div className="border-t border-gray-100 pt-6">
      <details className="group" open>
        <summary className="flex items-center justify-between cursor-pointer list-none">
          <h4 className="font-semibold text-lg text-primary font-playfair">
            REVIEWS {localReviews.length > 0 && (
              <span className="text-gray-400 font-normal text-base">
                ({localReviews.length})
              </span>
            )}
          </h4>
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
            <div
              className="relative rounded-2xl border border-accent/20 bg-gradient-to-br from-platinum/40 via-white to-platinum/30 px-8 py-8 text-center shadow-sm"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, rgba(183,110,121,0.04) 0%, transparent 60%)",
              }}
            >
              <p
                className="font-playfair italic leading-relaxed text-primary/80"
                style={{ fontSize: "0.95rem", letterSpacing: "0.01em" }}
              >
                ✨ Viora is a new chapter in timeless elegance. Our reviews are
                yet to be written, but our promise already stands — every jewel
                is carefully checked and delivered with the quality and finish
                showcased.
              </p>
              <span
                className="mt-4 inline-block h-px w-16 bg-accent/30"
                aria-hidden="true"
              />
              <p
                className="mt-5 font-playfair italic leading-relaxed text-primary/60"
                style={{ fontSize: "0.88rem", letterSpacing: "0.015em" }}
              >
                Your journey with Viora is special to us. We invite you to share
                your experience and become a part of our story.
              </p>
            </div>
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
                  <div className="relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0 border border-gray-200">
                    <Image
                      src={r.mediaUrl}
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
