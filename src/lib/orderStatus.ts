import { wixAdminClientServer } from "@/lib/wixAdminClientServer";
import * as velocity from "@/lib/crm/velocity";
import * as shiprocket from "@/lib/crm/shiprocket";
import * as ithink from "@/lib/crm/ithink";
import * as ordersStore from "@/lib/crm/orders-store";
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
  /** Courier's estimated delivery date, already formatted (e.g. "Thu, 2 Oct"). */
  edd?: string;
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

// Every courier exposes trackShipment(awb) + normalizeStatus(raw), so the
// timeline doesn't care which one shipped the order. Velocity is the default.
function courierModule(courier: string | null | undefined): any {
  const c = String(courier || "").toLowerCase();
  if (c === "shiprocket") return shiprocket;
  if (c === "ithink") return ithink;
  return velocity;
}

// Older orders only have the Wix fulfillment's tracking link to go on.
function inferCourierFromUrl(url?: string): string | null {
  const u = String(url || "").toLowerCase();
  if (u.includes("shiprocket")) return "shiprocket";
  if (u.includes("ithink")) return "ithink";
  if (u.includes("velocity")) return "velocity";
  return null;
}

// Dashboard/webhook status words → the couriers' canonical vocabulary.
const STORE_STATUS: Record<string, string> = {
  dispatched: "DISPATCHED",
  out_for_delivery: "OUT_FOR_DELIVERY",
  delivered: "DELIVERED",
  rto: "RTO",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
};

// Canonical courier status → timeline stage. The Wix fulfillment flag flips the
// moment an AWB is attached, so it can't tell shipped from delivered.
//   DELIVERED | OUT_FOR_DELIVERY | DISPATCHED | UNDELIVERED | RTO | CANCELLED | OTHER
function stageFromCanonical(canonical: string | null | undefined, hasTracking: boolean) {
  switch (String(canonical || "").toUpperCase()) {
    case "DELIVERED":
      return { index: 3, canceled: false };
    case "OUT_FOR_DELIVERY":
      return { index: 2, canceled: false };
    case "CANCELLED":
      return { index: 1, canceled: true };
    case "DISPATCHED":
    case "UNDELIVERED":
    case "RTO":
      return { index: 1, canceled: false };
    default:
      return { index: hasTracking ? 1 : 0, canceled: false };
  }
}

function formatEdd(edd: string | null | undefined): string | undefined {
  if (!edd) return undefined;
  const d = new Date(edd);
  if (isNaN(d.getTime())) return edd;
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
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
  const [tracking, storeRec] = await Promise.all([
    getTracking(guid),
    // The dashboard store knows WHICH courier shipped the order (the operator
    // assigns it there); keyed by the human order number.
    (ordersStore as any).getOrder(String(order.number)).catch(() => null) as Promise<any>,
  ]);

  const courier =
    (storeRec?.courier && String(storeRec.courier)) ||
    inferCourierFromUrl(storeRec?.trackingUrl || tracking?.trackingLink) ||
    "velocity";
  const awb: string | undefined = storeRec?.awb || tracking?.trackingNumber || undefined;
  const mod = courierModule(courier);

  let canonical: string | null = null;
  let trackUrl: string | undefined = storeRec?.trackingUrl || tracking?.trackingLink;
  let latestUpdate: string | undefined;
  let eddRaw: string | null = null;
  if (awb) {
    try {
      const t: any = await mod.trackShipment(awb);
      if (t?.ok) {
        canonical = t.status ? mod.normalizeStatus(t.status) : null;
        if (t.trackUrl) trackUrl = t.trackUrl;
        const a = Array.isArray(t.activities) ? t.activities[0] : null;
        if (a) latestUpdate = [a.activity, a.location, a.date].filter(Boolean).join(" · ");
        eddRaw = t.edd || null;
      }
    } catch {
      /* best-effort — an AWB alone still means "Shipped" */
    }
  }
  // Courier API unreachable: use the status our webhooks already recorded.
  if (!canonical && storeRec?.status) canonical = STORE_STATUS[String(storeRec.status).toLowerCase()] || null;

  const stage = stageFromCanonical(canonical, Boolean(awb));
  const storeCanceled = ["cancelled", "canceled"].includes(String(storeRec?.status || "").toLowerCase());
  const canceled = String(order.status || "").toUpperCase() === "CANCELED" || storeCanceled || stage.canceled;
  const info: any = extractOrderInfo({ order });
  const isWrap = (name: unknown) => /gift (packaging|wrap)/i.test(String(name || ""));

  return {
    guid,
    number: String(order.number ?? ""),
    placedAt: Date.parse(order._createdDate || order.createdDate || "") || Date.now(),
    stageIndex: stage.index,
    canceled,
    trackUrl,
    trackingNumber: awb,
    latestUpdate,
    edd: !canceled && stage.index < 3 ? formatEdd(eddRaw) : undefined,
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
