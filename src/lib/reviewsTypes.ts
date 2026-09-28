export type PublicReview = {
  id: string;
  authorName: string;
  rating: number;
  title?: string;
  body?: string;
  createdDate: string;
  mediaUrl?: string;
};

/** Coupon revealed to a returning customer after a photo review. */
export type ReviewReward = {
  code: string;
  amount: number;
  minimum: number;
};

export type CreateReviewResult =
  | { ok: true; review: PublicReview; reward?: ReviewReward }
  | {
      ok: false;
      error: "LOGIN_REQUIRED" | "INVALID" | "SERVER_ERROR";
      message?: string;
    };
