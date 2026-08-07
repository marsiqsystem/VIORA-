// Resolve a Viora product LINK (or slug) to its main product photo, so the inbox
// template composer can use the real product image as a message header instead
// of the Viora logo — e.g. when sending a review request for a specific item.
//
//   GET /api/product-image?link=https://viorajewel.in/ethnic-jewellery-set-d-004
//   GET /api/product-image?slug=ethnic-jewellery-set-d-004        (+ x-inbox-key)
//     -> { ok, imageUrl, name, slug }
//
// Uses the Wix admin API key (reliable server-side, no visitor cookie needed).
// Protected by INBOX_SECRET — same passcode as the rest of the inbox tools.

import { NextRequest, NextResponse } from "next/server";
import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { products } from "@wix/stores";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pull the product slug out of a pasted link. Viora product URLs are
// https://viorajewel.in/<slug> (also tolerates a /product-page/<slug> path,
// query strings, and a trailing slash). A bare slug passes straight through.
function slugFromInput(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s) && !s.includes("/")) return s; // already a bare slug
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    const segs = u.pathname.split("/").filter(Boolean);
    return decodeURIComponent(segs[segs.length - 1] || "");
  } catch {
    // Not a URL — take the last path-like segment.
    const segs = s.split(/[?#]/)[0].split("/").filter(Boolean);
    return segs[segs.length - 1] || "";
  }
}

function wixProductsClient() {
  return createClient({
    modules: { products },
    auth: ApiKeyStrategy({
      apiKey: process.env.WIX_API_KEY!,
      ...(process.env.WIX_SITE_ID
        ? { siteId: process.env.WIX_SITE_ID }
        : { accountId: process.env.WIX_ACCOUNT_ID! }),
    }),
  });
}

export async function GET(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
  }
  if (!authOk(keyFromRequest(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const link = req.nextUrl.searchParams.get("link") || req.nextUrl.searchParams.get("slug") || "";
  const slug = slugFromInput(link);
  if (!slug) {
    return NextResponse.json({ ok: false, error: "Paste a product link." }, { status: 400 });
  }
  if (!process.env.WIX_API_KEY) {
    return NextResponse.json({ ok: false, error: "Wix not configured." }, { status: 503 });
  }

  try {
    const res: any = await wixProductsClient().products.queryProducts().eq("slug", slug).find();
    const p = res?.items?.[0];
    if (!p) {
      return NextResponse.json(
        { ok: false, error: `No product found for "${slug}". Check the link.` },
        { status: 404 }
      );
    }
    const imageUrl: string | undefined =
      p.media?.mainMedia?.image?.url || p.media?.items?.[0]?.image?.url;
    if (!imageUrl) {
      return NextResponse.json({ ok: false, error: "That product has no image." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, imageUrl, name: p.name || "", slug: p.slug || slug });
  } catch (e: any) {
    console.error("[product-image] lookup failed:", e?.message || e);
    return NextResponse.json({ ok: false, error: "Product lookup failed." }, { status: 502 });
  }
}
