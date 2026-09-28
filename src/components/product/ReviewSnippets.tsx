"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReviewSnippet } from "@/lib/reviewSnippets";
import { wixThumb } from "@/lib/wixThumb";

const STAR_PATH =
  "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";

const Arrow = ({ dir, onClick }: { dir: "prev" | "next"; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={dir === "prev" ? "Previous review" : "Next review"}
    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:text-primary"
  >
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={dir === "prev" ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"} />
    </svg>
  </button>
);

/** One real customer quote at a time, near the price. Renders nothing without reviews. */
const ReviewSnippets = ({ snippets }: { snippets: ReviewSnippet[] }) => {
  const [index, setIndex] = useState(0);
  if (snippets.length === 0) return null;

  const s = snippets[index];
  const many = snippets.length > 1;
  const go = (step: number) => setIndex((i) => (i + step + snippets.length) % snippets.length);

  return (
    <figure className="flex items-center gap-2 border-y border-gray-100 py-3">
      {many && <Arrow dir="prev" onClick={() => go(-1)} />}
      <div className="flex min-w-0 flex-1 items-start gap-3" aria-live="polite">
        {s.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={wixThumb(s.image, 144)}
            alt={`Photo from ${s.author}`}
            width={48}
            height={48}
            loading="lazy"
            className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-platinum font-playfair text-xl font-semibold text-primary"
            aria-hidden="true"
          >
            {s.author.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <figcaption className="flex flex-wrap items-center gap-x-2 text-xs">
            <span className="font-semibold text-primary">{s.author}</span>
            <span className="flex" role="img" aria-label={`${s.rating} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <svg
                  key={n}
                  className={`h-3.5 w-3.5 ${n <= s.rating ? "text-amber-400" : "text-gray-300"}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path d={STAR_PATH} />
                </svg>
              ))}
            </span>
          </figcaption>
          <blockquote className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-gray-600">
            &ldquo;{s.body}&rdquo;
          </blockquote>
          {s.otherProduct && (
            <p className="mt-0.5 text-[11px] text-gray-400">
              Review of{" "}
              <Link href={`/${s.otherProduct.slug}`} className="underline underline-offset-2 hover:text-primary">
                {s.otherProduct.name}
              </Link>
            </p>
          )}
        </div>
      </div>
      {many && <Arrow dir="next" onClick={() => go(1)} />}
    </figure>
  );
};

export default ReviewSnippets;
