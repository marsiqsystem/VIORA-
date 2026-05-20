"use server";

import { wixClientServer } from "@/lib/wixClientServer";
import type { PublicReview, CreateReviewResult } from "@/lib/reviewsTypes";

const NAMESPACE = "stores";

// Wix Media URLs look like:
//   wix:image://v1/<path>/<filename>#originWidth=W&originHeight=H
// Browsers can't render that — convert to the static Wix CDN URL.
function toHttpsImage(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith("wix:image://")) return url;
  const match = url.match(/^wix:image:\/\/v1\/([^/#?]+)/);
  if (!match) return url;
  return `https://static.wixstatic.com/media/${match[1]}`;
}

export async function fetchProductReviews(
  productId: string
): Promise<PublicReview[]> {
  if (!productId) return [];
  try {
    const wixClient = await wixClientServer();
    const res = await wixClient.reviews
      .queryReviews()
      .eq("namespace", NAMESPACE)
      .eq("entityId", productId)
      .descending("_createdDate")
      .limit(50)
      .find();

    return (res.items || []).map((r: any) => ({
      id: r._id,
      authorName: r.author?.authorName || "Anonymous",
      rating: r.content?.rating || 0,
      title: r.content?.title || undefined,
      body: r.content?.body || undefined,
      createdDate: r._createdDate
        ? new Date(r._createdDate).toISOString()
        : new Date().toISOString(),
      mediaUrl: toHttpsImage(
        Array.isArray(r.content?.media) && r.content.media[0]?.image
          ? r.content.media[0].image
          : undefined
      ),
    }));
  } catch (err) {
    console.error("[reviews] fetchProductReviews failed:", err);
    return [];
  }
}

export async function getReviewUploadUrl(input: {
  mimeType: string;
  fileName: string;
}): Promise<
  | { ok: true; uploadUrl: string; fileName: string }
  | { ok: false; error: "LOGIN_REQUIRED" | "INVALID" | "SERVER_ERROR"; message?: string }
> {
  if (!input.mimeType?.startsWith("image/")) {
    return { ok: false, error: "INVALID", message: "Only images are allowed" };
  }
  try {
    const wixClient = await wixClientServer();
    if (!wixClient.auth.loggedIn()) {
      return { ok: false, error: "LOGIN_REQUIRED" };
    }
    const res: any = await wixClient.files.generateFileUploadUrl(
      input.mimeType,
      {
        fileName: input.fileName,
        parentFolderId: "media-root",
        private: false,
      } as any
    );
    if (!res?.uploadUrl) {
      return { ok: false, error: "SERVER_ERROR", message: "No upload URL returned" };
    }
    return { ok: true, uploadUrl: res.uploadUrl, fileName: input.fileName };
  } catch (err: any) {
    console.error("[reviews] getReviewUploadUrl failed:", err);
    return { ok: false, error: "SERVER_ERROR", message: err?.message };
  }
}

export async function createProductReview(input: {
  productId: string;
  rating: number;
  title?: string;
  body: string;
  mediaUrl?: string;
}): Promise<CreateReviewResult> {
  if (!input.productId || !input.body?.trim() || !input.rating) {
    return { ok: false, error: "INVALID", message: "Missing required fields" };
  }
  if (input.rating < 1 || input.rating > 5) {
    return { ok: false, error: "INVALID", message: "Rating must be 1-5" };
  }

  try {
    const wixClient = await wixClientServer();

    if (!wixClient.auth.loggedIn()) {
      return { ok: false, error: "LOGIN_REQUIRED" };
    }

    const memberRes = await wixClient.members.getCurrentMember({
      fieldsets: ["FULL"],
    } as any);
    const member = memberRes?.member;
    if (!member?.contactId) {
      return { ok: false, error: "LOGIN_REQUIRED" };
    }

    const displayName =
      member.profile?.nickname ||
      [member.contact?.firstName, member.contact?.lastName]
        .filter(Boolean)
        .join(" ") ||
      "Customer";

    const created: any = await wixClient.reviews.createReview({
      namespace: NAMESPACE,
      entityId: input.productId,
      author: {
        contactId: member.contactId,
        authorName: displayName,
      },
      content: {
        title: input.title?.trim() || undefined,
        body: input.body.trim(),
        rating: input.rating,
        media: input.mediaUrl ? [{ image: input.mediaUrl }] : undefined,
      },
    } as any);

    return {
      ok: true,
      review: {
        id: created._id,
        authorName: created.author?.authorName || displayName,
        rating: created.content?.rating || input.rating,
        title: created.content?.title || undefined,
        body: created.content?.body || input.body,
        createdDate: created._createdDate
          ? new Date(created._createdDate).toISOString()
          : new Date().toISOString(),
        mediaUrl: toHttpsImage(
          Array.isArray(created.content?.media) && created.content.media[0]?.image
            ? created.content.media[0].image
            : input.mediaUrl
        ),
      },
    };
  } catch (err: any) {
    console.error("[reviews] createProductReview failed:", err);
    return {
      ok: false,
      error: "SERVER_ERROR",
      message: err?.message || "Could not submit review",
    };
  }
}
