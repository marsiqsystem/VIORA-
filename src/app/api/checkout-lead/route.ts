// POST /api/checkout-lead
//   { phone, name?, email?, pincode?, subtotal, items[] }  -> { ok, id }
//   { phone, optOut: true }                                -> { ok }  (forget this phone)
//
// Saved from the checkout modal so one WhatsApp reminder can go out if the
// shopper leaves without ordering (see src/lib/crm/checkoutLeads.js).

import { NextRequest, NextResponse } from "next/server";
import * as checkoutLeads from "@/lib/crm/checkoutLeads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 20;

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

// Only what's needed to restore the cart and write the reminder.
function cleanItems(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_ITEMS)
    .map((item: any) => {
      const ref = item?.catalogReference;
      if (!ref || typeof ref.catalogItemId !== "string" || typeof ref.appId !== "string") return null;
      return {
        catalogReference: {
          appId: ref.appId,
          catalogItemId: ref.catalogItemId,
          ...(ref.options && typeof ref.options === "object" ? { options: ref.options } : {}),
        },
        quantity: Math.min(Math.max(Math.round(Number(item?.quantity) || 1), 1), 20),
        name: text(item?.name, 120),
        image: text(item?.image, 500),
      };
    })
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  if (!checkoutLeads.isConfigured()) return NextResponse.json({ ok: false });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }

  const phone = text(body?.phone, 10);
  if (!/^[6-9]\d{9}$/.test(phone)) {
    return NextResponse.json({ ok: false, error: "Invalid phone" }, { status: 400 });
  }

  if (body?.optOut === true) {
    await checkoutLeads.removeByPhone(phone);
    return NextResponse.json({ ok: true });
  }

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  if (!(await checkoutLeads.allowRequest(ip))) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  const items = cleanItems(body?.items);
  if (items.length === 0) return NextResponse.json({ ok: false, error: "Empty cart" }, { status: 400 });

  const subtotal = Number(body?.subtotal);
  const id = await checkoutLeads.saveLead({
    phone,
    name: text(body?.name, 80),
    email: text(body?.email, 120),
    pincode: text(body?.pincode, 6),
    subtotal: Number.isFinite(subtotal) && subtotal > 0 ? Math.min(subtotal, 500000) : 0,
    items,
  });
  return NextResponse.json({ ok: !!id, id });
}
