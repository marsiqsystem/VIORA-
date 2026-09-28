import Image from "next/image";
import Link from "next/link";
import type { ReviewsSummary } from "@/lib/homeData";

const Stars = ({ rating, className = "" }: { rating: number; className?: string }) => (
  <span className={`text-amber-500 ${className}`} aria-label={`${rating} out of 5 stars`}>
    {"★★★★★".slice(0, Math.round(rating))}
    <span className="text-gray-300">{"★★★★★".slice(Math.round(rating))}</span>
  </span>
);

/** Real Wix reviews only — the page hides this section until there are enough. */
const ReviewsWall = ({ summary }: { summary: ReviewsSummary | null }) => {
  if (!summary) return null;
  return (
    <section aria-labelledby="reviews-wall" className="bg-white px-4 py-10 md:px-6 md:py-14 lg:px-8">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Loved by our customers</p>
          <h2 id="reviews-wall" className="mt-1 font-playfair text-3xl font-bold text-primary md:text-4xl">
            What she said
          </h2>
        </div>
        <p className="flex items-center gap-2 text-sm text-gray-700">
          <Stars rating={summary.average} className="text-lg" />
          <b>{summary.average.toFixed(1)}</b> from {summary.count} reviews
        </p>
      </div>

      <ul className="scrollbar-hide -mx-4 mt-5 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0">
        {summary.items.slice(0, 6).map((review) => (
          <li key={review.id} className="w-[80%] shrink-0 snap-start border border-silver-light bg-platinum md:w-auto">
            {review.image && (
              <div className="relative aspect-square w-full">
                <Image src={review.image} alt={`Photo from ${review.author}`} fill sizes="(min-width: 768px) 33vw, 80vw" className="object-cover" />
              </div>
            )}
            <div className="p-4">
              <Stars rating={review.rating} />
              {review.title && <p className="mt-1 font-semibold text-primary">{review.title}</p>}
              <p className="mt-1 line-clamp-4 text-sm leading-relaxed text-gray-700">{review.body}</p>
              <p className="mt-3 text-xs font-semibold text-primary">
                {review.author}
                {review.productName && review.productSlug && (
                  <>
                    {" · "}
                    <Link href={`/${review.productSlug}`} className="font-medium text-accent underline-offset-2 hover:underline">
                      {review.productName}
                    </Link>
                  </>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default ReviewsWall;
