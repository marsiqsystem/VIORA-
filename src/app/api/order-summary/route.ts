// GET /api/order-summary?orderId=<wix order GUID>
// What the success page shows right after checkout, for guests too (checkout
// never requires a login). The GUID is unguessable and only reaches the buyer's
// own browser, but the response still carries as little personal data as
// possible: first name, city + pincode, the last 4 digits of the phone.

import { NextResponse, type NextRequest } from "next/server";
import { wixAdminClientServer } from "@/lib/wixAdminClientServer";
import { customFieldValue, extractOrderInfo } from "@/lib/crm/wixOrder";
import { ORDER_ACCESS_COOKIE, orderAccessCookieOptions, withOrderAccess } from "@/lib/orderAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The thank-you link stops showing details after this long. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const noStore = { "Cache-Control": "private, no-store" };
const notFound = () => NextResponse.json({ error: "not-found" }, { status: 404, headers: noStore });

export async function GET(req: NextRequest) {
  const orderId = new URL(req.url).searchParams.get("orderId") || "";
  if (!GUID.test(orderId)) return notFound();

  let order: any;
  try {
    order = await (wixAdminClientServer().orders as any).getOrder(orderId);
  } catch {
    return notFound();
  }
  if (!order) return notFound();

  const createdAt = Date.parse(order._createdDate || order.createdDate || "");
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > MAX_AGE_MS) return notFound();

  const info: any = extractOrderInfo({ order });
  const total = Number(info.amount) || Number(order.priceSummary?.total?.amount) || 0;
  // Paid wrap is a "Gift Packaging" cart line; free wrap is only a custom field.
  const isWrapLine = (name: unknown) => /gift (packaging|wrap)/i.test(String(name || ""));
  const giftWrap = !!customFieldValue(order, "gift wrap");

  const res = NextResponse.json(
    {
      orderNumber: info.orderId || String(order.number || ""),
      createdAt,
      firstName: String(order.billingInfo?.contactDetails?.firstName || info.customerName || "").split(" ")[0],
      paymentMode: info.paymentMode as "COD" | "PREPAID",
      paid: String(order.paymentStatus || "").toUpperCase() === "PAID",
      cancelled: String(order.status || "").toUpperCase() === "CANCELED",
      total,
      items: (info.items || [])
        .filter((it: any) => !isWrapLine(it.name))
        .map((it: any) => ({
          name: String(it.name).split(" - ")[0],
          variant: String(it.name).split(" - ").slice(1).join(" - ") || undefined,
          quantity: it.quantity,
          image: it.image,
          price: Number(it.price) || undefined,
        })),
      giftWrap,
      city: info.address?.city || "",
      postalCode: info.address?.postalCode || "",
      phoneLast4: info.phone ? String(info.phone).slice(-4) : "",
      hasEmail: !!(order.buyerInfo?.email || order.billingInfo?.contactDetails?.email),
      codCollect: info.paymentMode === "COD" ? Number(String(customFieldValue(order, "cod amount to collect") || "").replace(/[^\d.]/g, "")) || total : 0,
    },
    { headers: noStore }
  );
  // Holding the order link right after checkout proves ownership: let this
  // browser open the full tracking page later without an account.
  res.cookies.set(
    ORDER_ACCESS_COOKIE,
    withOrderAccess(req.cookies.get(ORDER_ACCESS_COOKIE)?.value, orderId),
    orderAccessCookieOptions
  );
  return res;
}
