import Image from "next/image";

const Reviews = async ({ productId }: { productId: string }) => {
  try {
    const reviewRes = await fetch(
      `https://api.fera.ai/v3/public/reviews?product.id=${productId}&public_key=${process.env.NEXT_PUBLIC_FERA_ID}`
    );

    // Check if response is successful
    if (!reviewRes.ok) {
      throw new Error(`Failed to fetch reviews: ${reviewRes.statusText}`);
    }

    const response = await reviewRes.json();

    // Validate data structure
    const reviews = response?.data || [];
    if (!Array.isArray(reviews)) {
      return null;
    }

    return (
      <>
        {reviews.map((review) => (
          <div className="flex flex-col gap-4" key={review?.id}>
            {/* USER */}
            <div className="flex items-center gap-4 font-medium">
              <Image
                src={review?.customer?.avatar_url || "/default-avatar.png"}
                alt="User avatar"
                width={32}
                height={32}
                className="rounded-full"
              />
              <span>{review?.customer?.display_name || "Anonymous"}</span>
            </div>

            {/* STARS */}
            <div className="flex gap-2">
              {Array.from({ length: review?.rating || 0 }).map((_, index) => (
                <Image
                  src="/star.png"
                  alt="Star"
                  key={index}
                  width={16}
                  height={16}
                />
              ))}
            </div>

            {/* DESC */}
            {review?.heading && <p>{review.heading}</p>}
            {review?.body && <p>{review.body}</p>}

            {/* MEDIA */}
            {review?.media?.length > 0 && (
              <div className="flex gap-2">
                {review.media.map((media: any) => (
                  <Image
                    src={media?.url || "/placeholder.jpg"}
                    key={media?.id}
                    alt="Review media"
                    width={100}
                    height={50}
                    className="object-cover"
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Show message when no reviews */}
        {reviews.length === 0 && (
          <p className="text-gray-500">No reviews yet</p>
        )}
      </>
    );
  } catch (error) {
    console.error("Error loading reviews:", error);
    return null; // Or display error message
  }
};

export default Reviews;
