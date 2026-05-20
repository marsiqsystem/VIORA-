import { wixAdminClientServer } from "@/lib/wixAdminClientServer";
import { wixClientServer } from "@/lib/wixClientServer";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import BackButton from "@/components/BackButton";

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

  return (
    <div className="flex flex-col min-h-[calc(100vh-180px)] items-center justify-center px-4 py-10 md:py-16">
      <div className="relative w-full max-w-2xl shadow-[rgba(0,_0,_0,_0.25)_0px_25px_50px_-12px] rounded-lg bg-white px-6 py-12 sm:px-10 sm:py-16 md:px-20 md:py-20">
        <div className="absolute top-4 left-4 md:top-6 md:left-6">
          <BackButton ariaLabel="Back to orders" />
        </div>
        <h1 className="text-xl pt-6 md:pt-0">Order Details</h1>
        <div className="mt-12 flex flex-col gap-6">
          <div>
            <span className="font-medium">Order Id: </span>
            <span>{order._id}</span>
          </div>
          <div>
            <span className="font-medium">Receiver Name: </span>
            <span>
              {[
                order.billingInfo?.contactDetails?.firstName,
                order.billingInfo?.contactDetails?.lastName,
              ]
                .filter(Boolean)
                .join(" ") || "N/A"}
            </span>
          </div>
          <div>
            <span className="font-medium">Receiver Email: </span>
            <span>{order.buyerInfo?.email || "N/A"}</span>
          </div>
          <div>
            <span className="font-medium">Price: </span>
            <span>{order.priceSummary?.subtotal?.amount || "N/A"}</span>
          </div>
          <div>
            <span className="font-medium">Payment Status: </span>
            <span>{order.paymentStatus || "N/A"}</span>
          </div>
          <div>
            <span className="font-medium">Order Status: </span>
            <span>{order.status || "N/A"}</span>
          </div>
          <div>
            <span className="font-medium">Delivery Address: </span>
            <span>
              {[
                order.billingInfo?.address?.addressLine1,
                order.billingInfo?.address?.city,
                order.billingInfo?.address?.subdivision,
                order.billingInfo?.address?.postalCode,
              ]
                .filter(Boolean)
                .join(", ") || "Not available"}
            </span>
          </div>
        </div>
      </div>
      <Link href="/contact" className="underline mt-6">
        Have a problem? Contact us
      </Link>
    </div>
  );
};

export default OrderPage;
