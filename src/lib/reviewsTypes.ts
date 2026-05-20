export type PublicReview = {
  id: string;
  authorName: string;
  rating: number;
  title?: string;
  body?: string;
  createdDate: string;
  mediaUrl?: string;
};

export type CreateReviewResult =
  | { ok: true; review: PublicReview }
  | {
      ok: false;
      error: "LOGIN_REQUIRED" | "INVALID" | "SERVER_ERROR";
      message?: string;
    };
