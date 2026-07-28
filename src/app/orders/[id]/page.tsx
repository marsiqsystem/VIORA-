import { wixAdminClientServer } from "@/lib/wixAdminClientServer";
import { wixClientServer } from "@/lib/wixClientServer";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import BackButton from "@/components/BackButton";
import OrderTimeline, {
  ORDER_STAGES,
  OrderStageKey,
} from "@/components/OrderTimeline";
import * as velocity from "@/lib/crm/velocity";

export const dynamic = "force-dynamic";

const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

// --- Read the carrier tracking (AWB + Velocity link) written back onto the Wix
// order by the whatsapp-crm backend (lib/wix.pushTracking -> a fulfillment with
// trackingInfo). Returns the first tracking record found, or null. Never throws.
async function getTracking(
  wixClient: ReturnType<typeof wixAdminClientServer>,
  orderId: string
): Promise<{ trackingNumber?: string; trackingLink?: string; provider?: string } | null> {
  try {
    const res: any = await (wixClient as any).orderFulfillments?.listFulfillmentsForSingleOrder?.(
      orderId
    );
    const fulfillments: any[] =
      res?.orderWithFulfillments?.fulfillments || res?.fulfillments || [];
    for (const f of fulfillments) {
      const t = f?.trackingInfo;
      if (t && (t.trackingNumber || t.trackingLink)) {
        return {
          trackingNumber: t.trackingNumber,
          trackingLink: t.trackingLink,
          provider: t.shippingProvider,
        };
      }
    }
  } catch (err) {
    console.error("Failed to read fulfillments", err);
  }
  return null;
}

// --- Map a LIVE Velocity shipment status to our 4-step timeline stage. The
// storefront asks Velocity's order-tracking API for the AWB's real status, so the
// timeline reflects the courier truth (not the Wix fulfillment flag, which flips
// to FULFILLED the moment we attach an AWB and would falsely read as delivered).
function stageFromVelocity(
  status: string | null | undefined,
  hasTracking: boolean
): { index: number; canceled: boolean } {
  const s = String(status || "").toLowerCase();
  if (["cancelled", "canceled", "rejected", "lost", "return_cancelled", "return_rejected"].includes(s))
    return { index: 1, canceled: true };
  if (["delivered", "rto_delivered", "return_delivered"].includes(s))
    return { index: 3, canceled: false }; // Delivered
  if (s === "out_for_delivery") return { index: 2, canceled: false }; // Out for Delivery
  // Any other live status (in_transit, pickup_scheduled, ndr_raised, …) with an
  // AWB present = at least Shipped.
  if (hasTracking) return { index: 1, canceled: false };
  return { index: 0, canceled: false }; // Confirmed — no shipment yet
}

const OrderPage = async ({ params }: { params: { id: string } }) => {
  const id = params.id;
  const memberClient = await wixClientServer();
  let member;
  try {
    const memberResponse = await memberClient.members.getCurrentMember({
      fieldsets: ["FULL"],
    } as any);
    member = memberResponse.member;
  } catch {
    member = null;
  }

  if (!member?._id) {
    redirect(`/login?redirectTo=/orders/${id}`);
  }

  const wixClient = wixAdminClientServer();

  let order: any;
  try {
    order = await wixClient.orders.getOrder(id);
  } catch (err) {
    return notFound();
  }

  const belongsToMember =
    (member.contactId && order.buyerInfo?.contactId === member.contactId) ||
    order.buyerInfo?.memberId === member._id;

  if (!belongsToMember) {
    return notFound();
  }

  const tracking = await getTracking(wixClient, id);

  // Ask Velocity for the AWB's live status so the timeline shows the courier's
  // real progress (Shipped -> Out for Delivery -> Delivered).
  let liveStatus: string | null = null;
  let liveTrackUrl: string | undefined = tracking?.trackingLink;
  let liveActivities: { date?: string; activity?: string; location?: string }[] = [];
  if (tracking?.trackingNumber) {
    try {
      const t: any = await velocity.trackShipment(tracking.trackingNumber);
      if (t?.ok) {
        liveStatus = t.status || null;
        if (t.trackUrl) liveTrackUrl = t.trackUrl;
        liveActivities = Array.isArray(t.activities) ? t.activities : [];
      }
    } catch {
      /* tracking is best-effort — fall back to "Shipped" if AWB exists */
    }
  }

  const wixCanceled = ["CANCELED", "CANCELLED"].includes(
    String(order?.status || "").toUpperCase()
  );
  const stage = stageFromVelocity(liveStatus, Boolean(tracking));
  const stageIndex = stage.index;
  const canceled = wixCanceled || stage.canceled;

  const receiverName =
    [
      order.billingInfo?.contactDetails?.firstName,
      order.billingInfo?.contactDetails?.lastName,
    ]
      .filter(Boolean)
      .join(" ") || "N/A";

  const address =
    [
      order.billingInfo?.address?.addressLine1,
      order.billingInfo?.address?.city,
      order.billingInfo?.address?.subdivision,
      order.billingInfo?.address?.postalCode,
    ]
      .filter(Boolean)
      .join(", ") || "Not available";

  const total = Number(
    order.priceSummary?.total?.amount || order.priceSummary?.subtotal?.amount || 0
  );

  const placedOn = order._createdDate
    ? new Date(order._createdDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "N/A";

  // Per-stage timestamps we can honestly show today.
  const timestamps: Partial<Record<OrderStageKey, string | number | null>> = {
    CONFIRMED: order._createdDate,
    DELIVERED: order.deliveredAt || null,
  };

  const currentLabel = canceled ? "Cancelled" : ORDER_STAGES[stageIndex].label;

  return (
    <div className="min-h-screen bg-platinum text-[#1A1410]">
      <section className="px-4 pt-10 pb-16 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center gap-2">
            <BackButton className="bg-white shadow-sm" ariaLabel="Back to orders" />
            <Link href="/account/orders" className="text-sm font-medium text-gray-500 hover:text-[#9B1B30]">
              Back to My Orders
            </Link>
          </div>

          {/* Header card */}
          <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-premium backdrop-blur-md md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#9B1B30]">
                  Order Tracking
                </p>
                <h1 className="mt-1 font-playfair text-3xl font-bold">#{order.number}</h1>
                <p className="mt-1 text-xs text-gray-500">Placed on {placedOn}</p>
              </div>
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                  canceled
                    ? "border-red-200 bg-red-100 text-red-800"
                    : stageIndex === 3
                    ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                    : "border-amber-200 bg-amber-100 text-amber-800"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {currentLabel}
              </span>
            </div>

            {/* Timeline */}
            <div className="mt-8">
              <OrderTimeline currentIndex={stageIndex} timestamps={timestamps} canceled={canceled} />
            </div>

            {/* Latest courier update (from Velocity's live tracking) */}
            {liveActivities.length > 0 && (
              <div className="mt-4 rounded-xl bg-platinum/60 px-4 py-3 text-xs text-gray-600">
                <span className="font-semibold text-[#1A1410]">Latest update: </span>
                {[
                  liveActivities[0].activity,
                  liveActivities[0].location,
                  liveActivities[0].date,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}

            {/* Live tracking button */}
            {liveTrackUrl ? (
              <a
                href={liveTrackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#1A1410] px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#9B1B30] sm:w-auto"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                Live Track on Courier
                {tracking?.trackingNumber && (
                  <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium">
                    AWB {tracking.trackingNumber}
                  </span>
                )}
              </a>
            ) : (
              <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white/60 px-4 py-3 text-center text-xs text-gray-500">
                Live courier tracking will appear here as soon as your order is shipped.
              </div>
            )}
          </div>

          {/* Items */}
          {order.lineItems?.length > 0 && (
            <div className="mt-6 rounded-2xl border border-white/60 bg-white/80 p-6 shadow-premium backdrop-blur-md md:p-8">
              <h2 className="font-playfair text-lg font-bold">Items in this order</h2>
              <div className="mt-4 divide-y divide-[#1A1410]/5">
                {order.lineItems.map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{item.productName?.original || "Product"}</p>
                      <p className="text-xs text-gray-500">Qty {item.quantity}</p>
                    </div>
                    <p className="font-playfair text-sm font-semibold">
                      {formatINR(
                        Number(item.totalPriceAfterTax?.amount || item.price?.amount || 0) *
                          (item.quantity || 1)
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Details */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-premium backdrop-blur-md">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gray-500">
                Delivery Address
              </p>
              <p className="mt-2 text-sm font-medium">{receiverName}</p>
              <p className="mt-1 text-sm text-gray-600">{address}</p>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-premium backdrop-blur-md">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gray-500">
                Payment
              </p>
              <p className="mt-2 text-sm">
                Status: <span className="font-medium">{order.paymentStatus || "N/A"}</span>
              </p>
              <p className="mt-1 font-playfair text-lg font-bold">{formatINR(total)}</p>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link href="/contact" className="text-sm text-gray-500 underline hover:text-[#9B1B30]">
              Have a problem? Contact us
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default OrderPage;
