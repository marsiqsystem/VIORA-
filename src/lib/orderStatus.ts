import { wixAdminClientServer } from "@/lib/wixAdminClientServer";
import * as velocity from "@/lib/crm/velocity";
import { customFieldValue, extractOrderInfo } from "@/lib/crm/wixOrder";
import { lastTenDigits } from "@/lib/orderAccess";

// Everything an order page shows, built from the Wix order + live courier
// tracking. Shared by /orders/[id] (members and verified guests).

export type OrderStatus = {
  guid: string;
  number: string;
  placedAt: number;
  /** 0 Confirmed · 1 Shipped · 2 Out for delivery · 3 Delivered */
  stageIndex: number;
  canceled: boolean;
  trackUrl?: string;
  trackingNumber?: string;
  latestUpdate?: string;
  items: { name: string; variant?: string; quantity: number; image?: string; price?: number }[];
  paymentMode: "COD" | "PREPAID";
  paid: boolean;
  amount: number;
  firstName: string;
  address: { line1: string; city: string; state: string; postalCode: string };
  giftWrap: boolean;
};

async function getTracking(orderGuid: string) {
  try {
    const res: any = await (wixAdminClientServer() as any).orderFulfillments?.listFulfillmentsForSingleOrder?.(orderGuid);
    const fulfillments: any[] = res?.orderWithFulfillments?.fulfillments || res?.fulfillments || [];
    for (const f of fulfillments) {
      const t = f?.trackingInfo;
      if (t && (t.trackingNumber || t.trackingLink)) {
        return { trackingNumber: t.trackingNumber as string | undefined, trackingLink: t.trackingLink as string | undefined };
      }
    }
  } catch (err) {
    console.error("[orderStatus] failed to read fulfillments", err);
  }
  return null;
}

// Live Velocity status → timeline stage. The Wix fulfillment flag flips the
// moment an AWB is attached, so it can't tell shipped from delivered.
function stageFromCourier(status: string | null | undefined, hasTracking: boolean) {
  const s = String(status || "").toLowerCase();
  if (["cancelled", "canceled", "rejected", "lost", "return_cancelled", "return_rejected"].includes(s))
    return { index: 1, canceled: true };
  if (["delivered", "rto_delivered", "return_delivered"].includes(s)) return { index: 3, canceled: false };
  if (s === "out_for_delivery") return { index: 2, canceled: false };
  if (hasTracking) return { index: 1, canceled: false };
  return { index: 0, canceled: false };
}

export async function getWixOrder(orderGuid: string): Promise<any | null> {
  try {
    return (await (wixAdminClientServer().orders as any).getOrder(orderGuid)) || null;
  } catch {
    return null;
  }
}

/** Find an order by its number when the phone on it matches. Null otherwise (no hint which part was wrong). */
export async function findOrderByNumberAndPhone(orderNumber: string, phone: string): Promise<any | null> {
  const number = Number(String(orderNumber).replace(/\D/g, ""));
  const typed = lastTenDigits(phone);
  if (!Number.isFinite(number) || number <= 0 || typed.length !== 10) return null;
  try {
    const res: any = await (wixAdminClientServer().orders as any).searchOrders({
      filter: { number: { $eq: number } },
      cursorPaging: { limit: 1 },
    });
    const order = res?.orders?.[0];
    if (!order) return null;
    const info: any = extractOrderInfo({ order });
    const onOrder = [info.phone, info.rawPhone, customFieldValue(order, "customer phone")].map(lastTenDigits);
    return onOrder.includes(typed) ? order : null;
  } catch (err) {
    console.error("[orderStatus] order lookup failed:", err);
    return null;
  }
}

export async function buildOrderStatus(order: any): Promise<OrderStatus> {
  const guid = String(order._id);
  const tracking = await getTracking(guid);

  let liveStatus: string | null = null;
  let trackUrl = tracking?.trackingLink;
  let latestUpdate: string | undefined;
  if (tracking?.trackingNumber) {
    try {
      const t: any = await (velocity as any).trackShipment(tracking.trackingNumber);
      if (t?.ok) {
        liveStatus = t.status || null;
        if (t.trackUrl) trackUrl = t.trackUrl;
        const a = Array.isArray(t.activities) ? t.activities[0] : null;
        if (a) latestUpdate = [a.activity, a.location, a.date].filter(Boolean).join(" · ");
      }
    } catch {
      /* best-effort — an AWB alone still means "Shipped" */
    }
  }

  const stage = stageFromCourier(liveStatus, Boolean(tracking));
  const info: any = extractOrderInfo({ order });
  const isWrap = (name: unknown) => /gift (packaging|wrap)/i.test(String(name || ""));

  return {
    guid,
    number: String(order.number ?? ""),
    placedAt: Date.parse(order._createdDate || order.createdDate || "") || Date.now(),
    stageIndex: stage.index,
    canceled: String(order.status || "").toUpperCase() === "CANCELED" || stage.canceled,
    trackUrl,
    trackingNumber: tracking?.trackingNumber,
    latestUpdate,
    items: (info.items || [])
      .filter((it: any) => !isWrap(it.name))
      .map((it: any) => ({
        name: String(it.name).split(" - ")[0],
        variant: String(it.name).split(" - ").slice(1).join(" - ") || undefined,
        quantity: it.quantity,
        image: it.image,
        price: Number(it.price) || undefined,
      })),
    paymentMode: info.paymentMode,
    paid: String(order.paymentStatus || "").toUpperCase() === "PAID",
    amount: Number(info.amount) || Number(order.priceSummary?.total?.amount) || 0,
    firstName: String(order.billingInfo?.contactDetails?.firstName || "").split(" ")[0],
    address: {
      line1: info.address?.line1 || "",
      city: info.address?.city || "",
      state: info.address?.state || "",
      postalCode: info.address?.postalCode || "",
    },
    giftWrap: !!customFieldValue(order, "gift wrap"),
  };
}
