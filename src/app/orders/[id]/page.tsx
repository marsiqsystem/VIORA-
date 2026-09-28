import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { wixClientServer } from "@/lib/wixClientServer";
import { ORDER_ACCESS_COOKIE, hasOrderAccess } from "@/lib/orderAccess";
import { buildOrderStatus, getWixOrder } from "@/lib/orderStatus";
import OrderStatusView from "@/components/orders/OrderStatusView";

export const dynamic = "force-dynamic";

/**
 * One order's tracking page. Open to the member who placed it, or to a guest
 * whose browser was granted access (success page right after checkout, or
 * order number + phone on /track). Anyone else is sent to /track.
 */
const OrderPage = async ({ params }: { params: { id: string } }) => {
  const id = params.id;
  const order = await getWixOrder(id);
  if (!order) return notFound();

  let member: any = null;
  try {
    const memberClient = await wixClientServer();
    member = (await memberClient.members.getCurrentMember({ fieldsets: ["FULL"] } as any)).member;
  } catch {
    member = null;
  }

  const ownedByMember =
    !!member?._id &&
    ((member.contactId && order.buyerInfo?.contactId === member.contactId) || order.buyerInfo?.memberId === member._id);
  const guestAccess = hasOrderAccess(cookies().get(ORDER_ACCESS_COOKIE)?.value, id);

  if (!ownedByMember && !guestAccess) {
    redirect(`/track?order=${encodeURIComponent(String(order.number ?? ""))}`);
  }

  const status = await buildOrderStatus(order);
  return (
    <OrderStatusView
      status={status}
      showFullAddress={ownedByMember}
      backHref={ownedByMember ? "/account/orders" : "/track"}
      backLabel={ownedByMember ? "My orders" : "Track another order"}
    />
  );
};

export default OrderPage;
