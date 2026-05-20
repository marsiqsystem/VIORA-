"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useWixClient } from "@/hooks/useWixClient";
import { createProductReview, getReviewUploadUrl } from "@/lib/reviewsActions";
import type { PublicReview } from "@/lib/reviewsTypes";

const LoginModal = dynamic(() => import("./LoginModal"), { ssr: false });

type Props = {
  open: boolean;
  onClose: () => void;
  productId?: string;
  productName?: string;
  onSubmitted?: (review: PublicReview) => void;
};

const ReviewModal = ({
  open,
  onClose,
  productId,
  productName,
  onSubmitted,
}: Props) => {
  const wixClient = useWixClient();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  if (!open) return null;

  const reset = () => {
    setRating(0);
    setHoverRating(0);
    setTitle("");
    setBody("");
    setSubmitted(false);
    setError(null);
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  const uploadPhoto = async (f: File): Promise<string | null> => {
    const urlRes = await getReviewUploadUrl({
      mimeType: f.type,
      fileName: f.name,
    });
    if (!urlRes.ok) {
      if (urlRes.error === "LOGIN_REQUIRED") {
        setShowLogin(true);
      } else {
        setError(urlRes.message || "Could not prepare photo upload.");
      }
      return null;
    }
    const putRes = await fetch(
      `${urlRes.uploadUrl}?filename=${encodeURIComponent(urlRes.fileName)}`,
      {
        method: "PUT",
        headers: { "Content-Type": f.type },
        body: f,
      }
    );
    if (!putRes.ok) {
      setError("Photo upload failed. Try a smaller file or try again.");
      return null;
    }
    const data = await putRes.json().catch(() => null);
    const mediaUrl: string | undefined =
      data?.file?.url || data?.file?.fileUrl || data?.fileUrl || data?.url;
    if (!mediaUrl) {
      setError("Photo upload returned no URL.");
      return null;
    }
    return mediaUrl;
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!productId) {
      setError("This review form isn't linked to a product. Please open it from a product page.");
      return;
    }
    if (!rating || !body.trim()) return;

    // Client-side login check first for a faster UX. Server re-validates.
    if (!wixClient.auth.loggedIn()) {
      setShowLogin(true);
      return;
    }

    setIsSubmitting(true);
    try {
      let mediaUrl: string | undefined;
      if (file) {
        const uploaded = await uploadPhoto(file);
        if (!uploaded) {
          setIsSubmitting(false);
          return;
        }
        mediaUrl = uploaded;
      }

      const result = await createProductReview({
        productId,
        rating,
        title: title.trim() || undefined,
        body: body.trim(),
        mediaUrl,
      });

      if (!result.ok) {
        if (result.error === "LOGIN_REQUIRED") {
          setShowLogin(true);
        } else {
          setError(result.message || "Could not submit your review. Please try again.");
        }
        setIsSubmitting(false);
        return;
      }

      onSubmitted?.(result.review);
      setSubmitted(true);
      setTimeout(() => {
        close();
      }, 1400);
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    }
    setIsSubmitting(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 md:p-8 max-h-[90vh] overflow-y-auto">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-xl font-playfair font-bold text-primary">
                Write a Review
              </h3>
              {productName && (
                <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                  {productName}
                </p>
              )}
            </div>
            <button
              onClick={close}
              aria-label="Close"
              className="text-gray-400 hover:text-gray-700"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {submitted ? (
            <div className="py-10 text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-medium text-primary">Thanks for your review!</p>
              <p className="text-sm text-gray-500 mt-1">
                It may take a moment to appear after moderation.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Rating
                </label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(star)}
                      aria-label={`${star} star`}
                      className="p-1"
                    >
                      <svg
                        className={`w-8 h-8 transition-colors ${
                          star <= (hoverRating || rating)
                            ? "text-accent"
                            : "text-gray-300"
                        }`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  placeholder="Sum it up in a line"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Review
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  rows={4}
                  maxLength={3000}
                  placeholder="Tell us what you loved (or didn't)…"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Add a Photo (optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                  className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary-light cursor-pointer"
                />
                {previewUrl && (
                  <div className="mt-3 relative w-24 h-24 rounded-md overflow-hidden border border-gray-200">
                    <Image
                      src={previewUrl}
                      alt="preview"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !rating || !body.trim() || !productId}
                className="w-full rounded-lg bg-accent py-3 px-6 text-sm font-semibold uppercase tracking-wider text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Submitting…" : "Submit Review"}
              </button>

              <p className="text-[11px] text-gray-400 text-center">
                You must be signed in to leave a review. Your review may be
                moderated before it appears.
              </p>
            </form>
          )}
        </div>
      </div>

      <LoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onLoggedIn={() => setShowLogin(false)}
      />
    </>
  );
};

export default ReviewModal;
