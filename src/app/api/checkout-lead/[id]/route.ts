// GET /api/checkout-lead/<id> -> { ok, items: [{ catalogReference, quantity }] }
// Used by the reminder link (/recover/<id>) to rebuild the cart. Returns cart
// items only — never the shopper's phone, email or address.

import { NextRequest, NextResponse } from "next/server";
import * as checkoutLeads from "@/lib/crm/checkoutLeads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = String(params?.id || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false }, { status: 400 });

  const lead: any = await checkoutLeads.getLead(id);
  if (!lead?.items?.length) return NextResponse.json({ ok: false }, { status: 404 });

  return NextResponse.json({
    ok: true,
    items: lead.items.map((item: any) => ({
      catalogReference: item.catalogReference,
      quantity: item.quantity,
    })),
  });
}
