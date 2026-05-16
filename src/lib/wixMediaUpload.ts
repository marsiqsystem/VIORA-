/**
 * Wix Media Manager upload helper (placeholder).
 *
 * To wire this up live, call the @wix/sdk media upload flow:
 *
 *   import { files } from "@wix/media";
 *
 *   const { uploadUrl } = await wixClient.files.generateFileUploadUrl({
 *     mimeType: file.type,
 *     fileName: file.name,
 *     parentFolderId: "<optional folder id>",
 *   });
 *
 *   const res = await fetch(uploadUrl, {
 *     method: "PUT",
 *     headers: { "Content-Type": file.type },
 *     body: file,
 *   });
 *   const { file: uploaded } = await res.json();
 *   return uploaded.url;
 *
 * Until that endpoint is enabled in the Wix backend, this returns a local
 * object URL so the UI can preview the selected image.
 */

export type UploadedMedia = {
  url: string;
  fileName: string;
  size: number;
  mimeType: string;
};

export async function uploadToWixMedia(file: File): Promise<UploadedMedia> {
  // TODO: replace with the real @wix/sdk media upload call described above.
  const url = URL.createObjectURL(file);
  return {
    url,
    fileName: file.name,
    size: file.size,
    mimeType: file.type,
  };
}
