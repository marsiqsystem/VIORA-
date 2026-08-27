// Admin: per-order PRODUCT OVERRIDE (colour/variant change after ordering).
//
//   GET    /api/admin/order-override            (x-inbox-key) -> { ok, overrides }
//   POST   /api/admin/order-override            (x-inbox-key)
//     { orderNumber, productLink? , product?, productImage? }
//       -> resolves productLink to the real Wix name+photo (like /api/product-image),
//          then stores the override. Explicit `product`/`productImage` win if given.
//     -> { ok, value }
//   DELETE /api/admin/order-override            (x-inbox-key) { orderNumber }
//     -> { ok }
//
// WHY: see src/lib/crm/orderOverride.js. Protected by INBOX_SECRET (same passcode
// as the inbox / dashboard tools). Fail closed.

import { NextRequest, NextResponse } from "next/server";
import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { products } from "@wix/stores";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import {
  listOverrides,
  setOverride,
  clearOverride,
} from "@/lib/crm/orderOverride";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}
function notConfigured() {
  return NextResponse.json({ ok: false, error: "INBOX_SECRET not configured." }, { status: 503 });
}

// Pull the slug out of a pasted Viora product link (mirrors /api/product-image).
function slugFromInput(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s) && !s.includes("/")) return s; // bare slug
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    const segs = u.pathname.split("/").filter(Boolean);
    return decodeURIComponent(segs[segs.length - 1] || "");
  } catch {
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

// Resolve a product link/slug -> { name, imageUrl }. Returns {} on any failure so
// the caller can still store an explicit name.
async function resolveProduct(link: string): Promise<{ name?: string; imageUrl?: string; error?: string }> {
  const slug = slugFromInput(link);
  if (!slug) return { error: "empty link" };
  if (!process.env.WIX_API_KEY) return { error: "Wix not configured" };
  try {
    const res: any = await wixProductsClient().products.queryProducts().eq("slug", slug).find();
    const p = res?.items?.[0];
    if (!p) return { error: `No product found for "${slug}".` };
    const imageUrl: string | undefined =
      p.media?.mainMedia?.image?.url || p.media?.items?.[0]?.image?.url;
    return { name: p.name || "", imageUrl };
  } catch (e: any) {
    console.error("[order-override] product lookup failed:", e?.message || e);
    return { error: "Product lookup failed." };
  }
}

export async function GET(req: NextRequest) {
  if (!authConfigured()) return notConfigured();
  if (!authOk(keyFromRequest(req))) return unauthorized();
  const overrides = await listOverrides();
  return NextResponse.json({ ok: true, overrides });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (!authConfigured()) return notConfigured();
  if (!authOk(body?.key ?? keyFromRequest(req))) return unauthorized();

  const orderNumber = String(body?.orderNumber ?? "").trim();
  if (!orderNumber) {
    return NextResponse.json({ ok: false, error: "Enter the order number." }, { status: 400 });
  }

  let product = String(body?.product ?? "").trim();
  let productImage = String(body?.productImage ?? "").trim();
  const link = String(body?.productLink ?? "").trim();

  // If a product link was pasted, resolve the real Wix name + photo. Explicit
  // values passed in the body still win (operator can override the display name).
  if (link) {
    const r = await resolveProduct(link);
    if (r.error && !product) {
      return NextResponse.json({ ok: false, error: r.error }, { status: 404 });
    }
    if (!product && r.name) product = r.name;
    if (!productImage && r.imageUrl) productImage = r.imageUrl;
  }

  if (!product) {
    return NextResponse.json(
      { ok: false, error: "Provide a product link or a product name." },
      { status: 400 }
    );
  }

  const saved = await setOverride(orderNumber, { product, productImage, note: body?.note });
  if (!saved.ok) {
    return NextResponse.json({ ok: false, error: saved.error }, { status: 503 });
  }
  return NextResponse.json({ ok: true, value: saved.value });
}

export async function DELETE(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (!authConfigured()) return notConfigured();
  if (!authOk(body?.key ?? keyFromRequest(req))) return unauthorized();

  const orderNumber = String(body?.orderNumber ?? "").trim();
  if (!orderNumber) {
    return NextResponse.json({ ok: false, error: "Enter the order number." }, { status: 400 });
  }
  const res = await clearOverride(orderNumber);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 503 });
  return NextResponse.json({ ok: true });
}
