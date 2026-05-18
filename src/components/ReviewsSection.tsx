"use client";

import Image from "next/image";
import { useState } from "react";
import ReviewModal from "./ReviewModal";

type MockReview = {
  name: string;
  rating: number;
  date: string;
  text: string;
  image?: string;
};

const MOCK_REVIEWS: MockReview[] = [
  {
    name: "Ananya R.",
    rating: 5,
    date: "2 weeks ago",
    text: "Packaging was gorgeous and the piece looks even better in person. Got compliments at a dinner the same evening.",
    image: "/product.png",
  },
  {
    name: "Priya M.",
    rating: 4,
    date: "1 month ago",
    text: "Beautiful finish and feels solid. Shipping was quick — the gift wrap was a sweet touch.",
  },
  {
    name: "Tanisha S.",
    rating: 5,
    date: "1 month ago",
    text: "Exactly what I was hoping for. The detailing is delicate and elegant, perfect for everyday wear.",
    image: "/product.png",
  },
  {
    name: "Sneha K.",
    rating: 5,
    date: "3 weeks ago",
    text: "Absolutely beautiful craftsmanship! It feels very premium and the polish is exceptional.",
  },
  {
    name: "Rohit V.",
    rating: 5,
    date: "2 months ago",
    text: "Bought this for an anniversary, my wife loved it. The quality easily exceeds the price tag.",
  },
  {
    name: "Kritika B.",
    rating: 4,
    date: "2 weeks ago",
    text: "Looks even better in person. Very premium packaging, making it a perfect gift option.",
    image: "/product.png",
  },
  {
    name: "Aarti P.",
    rating: 5,
    date: "3 months ago",
    text: "Such a stunning statement piece. I've worn it daily for weeks and it hasn't lost any shine.",
  },
  {
    name: "Meera D.",
    rating: 5,
    date: "1 week ago",
    text: "The delivery was super fast, and the jewelry itself is breathtaking. Highly recommend Viora!",
  },
  {
    name: "Neha W.",
    rating: 4,
    date: "1 month ago",
    text: "Very classy and versatile. It goes well with both ethnic and western outfits.",
  },
  {
    name: "Simran J.",
    rating: 5,
    date: "2 months ago",
    text: "I was skeptical buying jewelry online, but the quality here is unmatched. Flawless design.",
    image: "/product.png",
  }
];

type Props = {
  productName?: string;
  productIdHash?: number;
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

const ReviewsSection = ({ productName, productIdHash = 0 }: Props) => {
  const [open, setOpen] = useState(false);

  // Deterministically select 2 or 3 reviews based on the hash
  const numReviews = 2 + (productIdHash % 2); // 2 or 3
  const startIndex = productIdHash % (MOCK_REVIEWS.length - numReviews + 1);
  const selectedReviews = MOCK_REVIEWS.slice(startIndex, startIndex + numReviews);

  return (
    <div className="border-t border-gray-100 pt-6">
      <details className="group" open>
        <summary className="flex items-center justify-between cursor-pointer list-none">
          <h4 className="font-semibold text-lg text-primary font-playfair">
            REVIEWS
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
          {selectedReviews.map((r, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-100 bg-platinum/40 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-primary">{r.name}</p>
                    <span className="text-xs text-gray-400">· {r.date}</span>
                  </div>
                  <Stars value={r.rating} />
                </div>
                {r.image && (
                  <div className="relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0 border border-gray-200">
                    <Image
                      src={r.image}
                      alt={`${r.name}'s photo`}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                {r.text}
              </p>
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
        productName={productName}
      />
    </div>
  );
};

export default ReviewsSection;
