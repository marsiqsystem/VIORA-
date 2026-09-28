/**
 * A small, cropped version of a Wix media image for thumbnails (review photos
 * are uploaded full size — a 3 MB PNG for a 48 px square otherwise). Wix resizes
 * on its CDN; `enc_auto` serves WebP/AVIF where supported. Non-Wix URLs are
 * returned unchanged.
 */
export const wixThumb = (url: string | undefined | null, px: number): string | undefined => {
  if (!url) return undefined;
  const match = url.match(/^https:\/\/static\.wixstatic\.com\/media\/([^/?#]+)/);
  if (!match) return url;
  const id = match[1];
  const ext = id.includes(".") ? id.slice(id.lastIndexOf(".")) : ".jpg";
  return `https://static.wixstatic.com/media/${id}/v1/fill/w_${px},h_${px},al_c,q_85,enc_auto/thumb${ext}`;
};
