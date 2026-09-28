// Checkout reminders — triggered by a Vercel Cron (see vercel.json). Sends ONE
// WhatsApp reminder (abandoned_cart_v1) to shoppers who entered their phone at
// checkout but didn't order within CHECKOUT_REMINDER_DELAY_MIN (default 60).
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; we require it when the
// secret is configured so nobody else can trigger a blast.

import { NextRequest, NextResponse } from "next/server";
import * as checkoutLeads from "@/lib/crm/checkoutLeads";
import * as notify from "@/lib/crm/notify";
import { normalizePhone, toWixImageUrl } from "@/lib/crm/wixOrder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// abandoned_cart_v1's URL button appends this suffix to the base URL set in
// WhatsApp Manager. With a base of "https://www.viorajewel.in/{{1}}" the default
// opens /recover/<id>, which rebuilds the cart on whatever device taps it.
const suffixFor = (id: string) =>
  (process.env.CHECKOUT_REMINDER_URL_SUFFIX || "recover/{id}").replace("{id}", id);

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let sent = 0;
  const due: any[] = await checkoutLeads.dueLeads();

  for (const lead of due) {
    const to = normalizePhone(lead.phone, process.env.DEFAULT_COUNTRY_CODE || "91");
    // One reminder per phone per week; the lead leaves the queue either way.
    if (!to || !(await checkoutLeads.claimReminder(lead.phone))) {
      await checkoutLeads.markDone(lead.id);
      continue;
    }

    try {
      const items: any[] = Array.isArray(lead.items) ? lead.items : [];
      const first = items[0] || {};
      const product =
        items.length > 1 ? `${first.name} (+${items.length - 1} more)` : first.name || "your cart";

      const result: any = await notify.sendAbandonedCart({
        phone: to,
        name: lead.name || "there",
        product,
        amount: String(Math.round(Number(lead.subtotal) || 0)),
        productImage: toWixImageUrl(first.image),
        cartToken: suffixFor(lead.id),
      });

      if (result.ok && !result.dryRun) {
        sent++;
      } else {
        // Dry-run or failure: free the week's claim, but don't retry every tick.
        await checkoutLeads.releaseReminder(lead.phone);
        if (!result.ok) console.error("[cron/checkout-reminders] send failed:", result.error || result.data);
      }
    } catch (err) {
      await checkoutLeads.releaseReminder(lead.phone);
      console.error("[cron/checkout-reminders] send error:", err);
    }
    await checkoutLeads.markDone(lead.id);
  }

  return NextResponse.json({ ok: true, due: due.length, sent });
}
