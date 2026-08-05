// Inbox UPLOAD — receives the operator's attachment (multipart form, field
// `file`) and uploads it to Meta, returning a reusable media id the composer
// then sends via /api/inbox/send. Keeping upload separate from send means a
// slow upload never blocks the send's 24-hour-window check.
//
//   POST /api/inbox/upload   (multipart: file=<image>)   + ?key= / x-inbox-key
//     -> { ok, mediaId, mime }
//
// Protected by INBOX_SECRET. Images only (WhatsApp image message), capped in size.

import { NextRequest, NextResponse } from "next/server";
import { uploadMedia } from "@/lib/crm/whatsapp";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// WhatsApp caps: images 5MB, documents 100MB (we cap docs at 16MB to stay well
// under the serverless request limit). Reject early with a clear message.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DOC_BYTES = 16 * 1024 * 1024;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DOC_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

export async function POST(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  }
  if (!authOk(keyFromRequest(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f && typeof f !== "string") file = f as File;
  } catch {
    /* not multipart */
  }
  if (!file) {
    return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  const isImage = IMAGE_MIMES.has(mime);
  const isDoc = DOC_MIMES.has(mime);
  if (!isImage && !isDoc) {
    return NextResponse.json(
      { ok: false, error: "Unsupported file type (images: JPG/PNG/WebP; docs: PDF/Word/Excel/CSV/TXT)." },
      { status: 415 }
    );
  }
  const cap = isImage ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
  if (file.size > cap) {
    return NextResponse.json(
      { ok: false, error: `File too large (max ${isImage ? "5MB" : "16MB"}).` },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const up = await uploadMedia({ buffer, mime, filename: file.name || (isImage ? "photo" : "document") });
  if (!up.ok || !up.id) {
    return NextResponse.json(
      { ok: false, error: typeof up.error === "string" ? up.error : "Upload failed." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    mediaId: up.id,
    mime,
    kind: isImage ? "image" : "document",
    filename: file.name || "",
    dryRun: !!up.dryRun,
  });
}
