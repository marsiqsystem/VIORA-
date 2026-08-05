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

// WhatsApp caps images at 5MB; reject early with a clear message.
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

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
  if (!ALLOWED.has(mime)) {
    return NextResponse.json(
      { ok: false, error: "Only JPG, PNG or WebP images are supported." },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Image too large (max 5MB)." },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const up = await uploadMedia({ buffer, mime, filename: file.name || "photo" });
  if (!up.ok || !up.id) {
    return NextResponse.json(
      { ok: false, error: typeof up.error === "string" ? up.error : "Upload failed." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, mediaId: up.id, mime, dryRun: !!up.dryRun });
}
