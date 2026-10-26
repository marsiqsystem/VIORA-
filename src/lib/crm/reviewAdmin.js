// Server-side (ADMIN) product-review posting + photo upload, for the
// WhatsApp-native review capture. The storefront's createProductReview requires
// a logged-in member (reviewsActions.ts); these helpers instead post as the site
// admin via the Wix API key, so a guest COD customer who replies on WhatsApp gets
// their review onto the website with no login. Requires the WIX_API_KEY to carry
// "Wix Reviews — Manage Reviews" + Media Manager permissions (see
// wixAdminClientServer). Everything here is best-effort and never throws.

import { wixAdminClientServer } from "@/lib/wixAdminClientServer";
import { fetchMediaBytes } from "./whatsapp";

const NAMESPACE = "stores";

/**
 * Download a customer's WhatsApp photo and upload it into the Wix Media Manager
 * as admin. Returns the uploaded media URL (usable as a review's media image) or
 * null on any failure.
 * @param {string} mediaId  Meta media id from the inbound image message.
 * @param {string} [fileName]
 * @returns {Promise<string|null>}
 */
export async function uploadWhatsAppPhotoToWix(mediaId, fileName = "review-photo.jpg") {
  if (!mediaId) return null;
  try {
    const media = await fetchMediaBytes(mediaId);
    if (!media.ok || !media.buffer?.length) {
      console.warn("[reviewAdmin] media download failed:", media.error);
      return null;
    }
    const mime = media.mime || "image/jpeg";
    const client = wixAdminClientServer();

    // 1) ask Wix for a one-time upload URL.
    const gen = await client.files.generateFileUploadUrl(mime, {
      fileName,
      parentFolderId: "media-root",
      private: false,
    });
    const uploadUrl = gen?.uploadUrl;
    if (!uploadUrl) {
      console.warn("[reviewAdmin] no uploadUrl from Wix.");
      return null;
    }

    // 2) PUT the bytes (filename goes as a query param per Wix's upload API).
    const putUrl = `${uploadUrl}${uploadUrl.includes("?") ? "&" : "?"}filename=${encodeURIComponent(fileName)}`;
    const putRes = await fetch(putUrl, {
      method: "PUT",
      headers: { "Content-Type": mime },
      body: new Uint8Array(media.buffer),
    });
    if (!putRes.ok) {
      console.warn(`[reviewAdmin] media upload PUT HTTP ${putRes.status}`);
      return null;
    }
    const out = await putRes.json().catch(() => ({}));
    const file = out?.file || out;
    const url = file?.url || file?.fileUrl || file?.media?.image?.url;
    if (!url) {
      console.warn("[reviewAdmin] upload response had no file url:", JSON.stringify(out).slice(0, 300));
      return null;
    }
    return url;
  } catch (err) {
    console.error("[reviewAdmin] uploadWhatsAppPhotoToWix failed:", err?.message || err);
    return null;
  }
}

/**
 * Post a product review as the site admin.
 * @param {{productId:string, rating:number, title?:string, body:string,
 *          mediaUrl?:string, authorName?:string}} input
 * @returns {Promise<{ok:boolean, id?:string, error?:any}>}
 */
export async function postReviewAsAdmin(input) {
  const { productId, rating, title, body, mediaUrl, authorName } = input || {};
  if (!productId || !rating || !body?.trim()) {
    return { ok: false, error: "missing productId/rating/body" };
  }
  if (rating < 1 || rating > 5) return { ok: false, error: "rating out of range" };
  try {
    const client = wixAdminClientServer();
    const created = await client.reviews.createReview({
      namespace: NAMESPACE,
      entityId: productId,
      author: { authorName: authorName?.trim() || "Verified buyer" },
      content: {
        title: title?.trim() || undefined,
        body: body.trim(),
        rating,
        media: mediaUrl ? [{ image: mediaUrl }] : undefined,
      },
    });
    return { ok: true, id: created?._id || created?.review?._id };
  } catch (err) {
    console.error("[reviewAdmin] postReviewAsAdmin failed:", err?.message || err);
    return { ok: false, error: err?.message || err };
  }
}
