"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { orders } from "@wix/ecom";
import { media as wixMedia } from "@wix/sdk";
import AccountTabs from "@/components/account/AccountTabs";
import ExchangeModal from "@/components/ExchangeModal";
import ReviewModal from "@/components/ReviewModal";
import { useWixClient } from "@/hooks/useWixClient";
import { REVIEW_REWARD } from "@/lib/checkoutPricing";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Service lines (COD charge, gift packaging) aren't pieces the customer bought. */
const isServiceLine = (li: orders.OrderLineItem) =>
  String(li.itemType?.preset || "").toUpperCase() === "SERVICE" ||
  /cod charge|delivery \+ cod|gift packaging|gift wrap/i.test(String(li.productName?.original || ""));

const customField = (order: orders.Order, title: string) =>
  ((order as any).customFields || []).find((f: any) => String(f?.title || "").toLowerCase().includes(title))?.value as
    | string
    | undefined;

/** Wix says "APPROVED" for every live order; customers need something they understand. */
const statusOf = (order: orders.Order) => {
  if (String(order.status).toUpperCase() === "CANCELED") return { label: "Cancelled", tone: "bg-red-100 text-red-800 border-red-200" };
  if (String(order.fulfillmentStatus).toUpperCase() === "FULFILLED")
    return { label: "Shipped", tone: "bg-blue-100 text-blue-800 border-blue-200" };
  return { label: "Confirmed · packing", tone: "bg-amber-100 text-amber-800 border-amber-200" };
};

type Review = { productId: string; productName: string };
type Exchange = { id: string; number?: string | number; productName?: string; name?: string; email?: string; phone?: string };

const MyOrdersPage = () => {
  const wixClient = useWixClient();
  const router = useRouter();
  const [list, setList] = useState<orders.Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState<Review | null>(null);
  const [exchange, setExchange] = useState<Exchange | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (!wixClient.auth.loggedIn()) {
          router.replace("/login?redirectTo=/account/orders");
          return;
        }
        const { member } = await wixClient.members.getCurrentMember({ fieldsets: ["FULL"] } as any);
        if (!member?._id) {
          router.replace("/login?redirectTo=/account/orders");
          return;
        }
        const res = await wixClient.orders.searchOrders({
          filter: member.contactId
            ? { "buyerInfo.contactId": { $eq: member.contactId } }
            : { "buyerInfo.memberId": { $eq: member._id } },
          cursorPaging: { limit: 30 },
        });
        const sorted = [...(res.orders || [])].sort(
          (a, b) => new Date(b._createdDate || 0).getTime() - new Date(a._createdDate || 0).getTime()
        );
        setList(sorted);
      } catch (err) {
        console.error("Failed to fetch orders", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router, wixClient]);

  return (
    <div className="min-h-screen bg-platinum px-4 pb-14 pt-5 text-primary md:px-6 md:pt-10 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <AccountTabs />
        <h1 className="mt-5 font-playfair text-3xl font-bold">My orders</h1>
        <p className="mt-1 text-sm text-gray-600">
          Ordered without logging in?{" "}
          <Link href="/track" className="font-semibold text-accent hover:underline">
            Track with your order number
          </Link>
        </p>

        <div className="mt-5 space-y-4">
          {loading ? (
            [0, 1].map((i) => <div key={i} className="h-40 animate-pulse bg-white" />)
          ) : list.length === 0 ? (
            <div className="bg-white px-5 py-10 text-center">
              <p className="font-playfair text-xl">No orders on this account yet</p>
              <p className="mt-2 text-sm text-gray-600">
                Orders placed without logging in don&apos;t show here —{" "}
                <Link href="/track" className="font-semibold text-accent hover:underline">track them with your order number</Link>.
              </p>
              <Link href="/list" className="mt-5 inline-flex h-11 items-center bg-accent px-6 text-sm font-bold uppercase tracking-wide text-white">
                Start shopping
              </Link>
            </div>
          ) : (
            list.map((order) => {
              const status = statusOf(order);
              const pieces = (order.lineItems || []).filter((li) => !isServiceLine(li));
              const cod = /cash on delivery/i.test(customField(order, "payment method") || "");
              const paid = String(order.paymentStatus).toUpperCase() === "PAID";
              const cancelled = status.label === "Cancelled";
              const shipped = status.label === "Shipped";
              const ageDays = (Date.now() - new Date(order._createdDate || 0).getTime()) / 86_400_000;
              const c = order.billingInfo?.contactDetails;

              return (
                <article key={order._id} className="bg-white shadow-sm">
                  <header className="flex flex-wrap items-start justify-between gap-3 border-b border-silver-light px-5 py-4">
                    <div>
                      <p className="font-playfair text-lg font-bold">#{order.number}</p>
                      <p className="text-xs text-gray-500">
                        {order._createdDate
                          ? new Date(order._createdDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                          : ""}
                        {" · "}
                        {cancelled ? "" : paid ? "Paid" : cod ? "Cash on Delivery" : "Payment pending"}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${status.tone}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {status.label}
                    </span>
                  </header>

                  <ul className="divide-y divide-silver-light">
                    {pieces.map((item, i) => {
                      const [name, ...variant] = String(item.productName?.original || "Product").split(" - ");
                      return (
                        <li key={i} className="flex items-center gap-3 px-5 py-3">
                          <span className="relative h-14 w-14 shrink-0 overflow-hidden bg-platinum">
                            {item.image && (
                              <Image src={wixMedia.getScaledToFillImageUrl(item.image, 112, 112, {})} alt="" fill sizes="56px" className="object-cover" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{name}</span>
                            <span className="block text-xs text-gray-500">{[variant.join(" - "), `Qty ${item.quantity}`].filter(Boolean).join(" · ")}</span>
                          </span>
                          {!cancelled && ageDays > 5 && item.catalogReference?.catalogItemId && (
                            <button
                              type="button"
                              onClick={() => setReview({ productId: item.catalogReference!.catalogItemId!, productName: name })}
                              className="shrink-0 text-xs font-semibold text-accent hover:underline"
                            >
                              Review · ₹{REVIEW_REWARD.amount} off
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-silver-light bg-platinum/60 px-5 py-3">
                    <p className="text-sm">
                      Total <b className="font-playfair text-lg">{inr(Number(order.priceSummary?.total?.amount || 0))}</b>
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      {shipped && (
                        <button
                          type="button"
                          onClick={() =>
                            setExchange({
                              id: order._id || "",
                              number: order.number,
                              productName: pieces[0]?.productName?.original || undefined,
                              name: [c?.firstName, c?.lastName].filter(Boolean).join(" ") || undefined,
                              email: order.buyerInfo?.email || undefined,
                              phone: c?.phone || undefined,
                            })
                          }
                          className="text-xs font-semibold text-gray-600 underline-offset-2 hover:underline"
                        >
                          Damaged or wrong? Exchange
                        </button>
                      )}
                      <Link
                        href={`/orders/${order._id}`}
                        className="inline-flex h-10 items-center bg-primary px-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-accent"
                      >
                        {cancelled ? "View order" : "Track order"}
                      </Link>
                    </div>
                  </footer>
                </article>
              );
            })
          )}
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Exchanges are for damaged or wrong pieces within 48 hours of delivery —{" "}
          <Link href="/exchange-policy" className="font-semibold text-accent hover:underline">see the policy</Link>.
        </p>
      </div>

      <ReviewModal open={!!review} onClose={() => setReview(null)} productId={review?.productId} productName={review?.productName} />
      <ExchangeModal
        open={!!exchange}
        onClose={() => setExchange(null)}
        orderId={exchange?.id ?? ""}
        orderNumber={exchange?.number}
        productName={exchange?.productName}
        customerName={exchange?.name}
        customerEmail={exchange?.email}
        customerPhone={exchange?.phone}
      />
    </div>
  );
};

export default MyOrdersPage;
