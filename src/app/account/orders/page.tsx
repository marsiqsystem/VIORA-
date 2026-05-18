"use client";

import Link from "next/link";
import Image from "next/image";
import { useWixClient } from "@/hooks/useWixClient";
import { useEffect, useState } from "react";
import { orders } from "@wix/ecom";
import ExchangeModal from "@/components/ExchangeModal";


const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const statusStyles: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-blue-100 text-blue-800 border-blue-200",
  FULFILLED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CANCELED: "bg-red-100 text-red-800 border-red-200",
};

const SIDEBAR = [
  {
    id: "orders",
    label: "My Orders",
    href: "/account/orders",
    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  },
  {
    id: "wishlist",
    label: "Wishlist",
    href: "/profile?tab=wishlist",
    icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  },
];

const MyOrdersPage = () => {
  const [exchangeOrderId, setExchangeOrderId] = useState<string | null>(null);
  const wixClient = useWixClient();
  const [realOrders, setRealOrders] = useState<orders.Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        if (wixClient.auth.loggedIn()) {
          // In a real scenario, use searchOrders to get list. 
          // (User prompt mentioned getOrder(orderId), but searchOrders is correct for a list)
          const res = await wixClient.orders.searchOrders({
            cursorPaging: { limit: 20 },
          });
          setRealOrders(res.orders || []);
        }
      } catch (err) {
        console.error("Failed to fetch orders", err);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [wixClient]);

  return (
    <div className="min-h-screen bg-platinum text-[#1A1410]">
      <section className="px-4 pt-10 pb-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9B1B30]">
            My Account
          </p>
          <h1 className="mt-2 font-playfair text-3xl md:text-4xl font-bold">
            My Orders
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Track shipments and request exchanges within 48 hours of delivery.
          </p>
        </div>
      </section>

      <section className="px-4 pb-20 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[260px_1fr]">
          {/* Sidebar */}
          <aside className="h-fit rounded-2xl border border-white/60 bg-white/70 p-3 shadow-premium backdrop-blur-md">
            <nav className="space-y-1">
              {SIDEBAR.map((tab) => {
                const active = tab.id === "orders";
                return (
                  <Link
                    key={tab.id}
                    href={tab.href}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                      active
                        ? "bg-[#1A1410] text-white shadow-premium"
                        : "text-[#1A1410] hover:bg-[#9B1B30]/5 hover:text-[#9B1B30]"
                    }`}
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d={tab.icon}
                      />
                    </svg>
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          {/* Orders list */}
          <div className="space-y-5">
            {loading ? (
              <div className="rounded-2xl border border-white/60 bg-white/70 p-10 text-center shadow-premium backdrop-blur-md">
                <p className="animate-pulse font-playfair text-xl text-[#1A1410]">Loading your orders...</p>
              </div>
            ) : realOrders.length === 0 ? (
              <div className="rounded-2xl border border-white/60 bg-white/70 p-10 text-center shadow-premium backdrop-blur-md">
                <p className="font-playfair text-xl text-[#1A1410]">
                  You haven&apos;t placed an order yet.
                </p>
                <p className="mt-2 text-sm text-gray-600">
                  When you do, you&apos;ll be able to track and exchange it here.
                </p>
                <Link
                  href="/list"
                  className="mt-6 inline-flex rounded-full bg-[#9B1B30] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#7d1626]"
                >
                  Start shopping
                </Link>
              </div>
            ) : (
              realOrders.map((order) => {
                const statusStr = order.status || "PENDING";
                return (
                  <article
                    key={order._id}
                    className="overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-premium backdrop-blur-md transition-shadow hover:shadow-premium-hover"
                  >
                    {/* Header */}
                    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1A1410]/5 px-5 py-4 md:px-6">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gray-500">
                          Order
                        </p>
                        <p className="font-playfair text-lg font-bold text-[#1A1410]">
                          #{order.number}
                        </p>
                        <p className="text-xs text-gray-500">
                          Placed on {order._createdDate ? new Date(order._createdDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "N/A"}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                          statusStyles[statusStr] || "bg-gray-100 text-gray-800 border-gray-200"
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {statusStr}
                      </span>
                    </header>

                    {/* Items */}
                    <div className="divide-y divide-[#1A1410]/5">
                      {order.lineItems?.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-4 px-5 py-4 md:px-6"
                        >
                          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-platinum">
                            {item.image ? (
                              <Image
                                src={item.image}
                                alt={item.productName?.original || "Item"}
                                fill
                                sizes="64px"
                                loading="lazy"
                                className="object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-200" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="line-clamp-1 text-sm font-medium text-[#1A1410]">
                              {item.productName?.original || "Product"}
                            </p>
                            <p className="text-xs text-gray-500">
                              Qty {item.quantity} · {formatINR(Number(item.price?.amount || 0))}
                            </p>
                          </div>
                          <p className="font-playfair text-base font-semibold text-[#1A1410]">
                            {formatINR(Number(item.totalPriceAfterTax?.amount || item.price?.amount || 0) * (item.quantity || 1))}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Footer / actions */}
                    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1A1410]/5 bg-platinum/60 px-5 py-4 md:px-6">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gray-500">
                          Order Total
                        </p>
                        <p className="font-playfair text-lg font-bold text-[#1A1410]">
                          {formatINR(Number(order.priceSummary?.total?.amount || 0))}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/orders/${order._id}`}
                          className="inline-flex items-center gap-2 rounded-full border border-[#1A1410] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#1A1410] transition-colors hover:bg-[#1A1410] hover:text-white"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.8}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3 7h11v10H3z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M14 10h4l3 3v4h-7"
                            />
                            <circle cx="7.5" cy="17.5" r="1.5" />
                            <circle cx="17.5" cy="17.5" r="1.5" />
                          </svg>
                          Track Order
                        </Link>
                        <button
                          type="button"
                          onClick={() => setExchangeOrderId(order._id || "")}
                          className="inline-flex items-center gap-2 rounded-full bg-[#9B1B30] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-[#7d1626]"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.8}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4 4v6h6M20 20v-6h-6M20 9A8 8 0 005.6 5.6M4 15a8 8 0 0014.4 3.4"
                            />
                          </svg>
                          Exchange Order
                        </button>
                      </div>
                    </footer>
                  </article>
                );
              })
            )}



            <p className="px-2 text-xs text-gray-500">
              Exchanges are eligible within{" "}
              <Link
                href="/exchange-policy"
                className="font-semibold text-[#9B1B30] hover:underline"
              >
                48 hours of delivery
              </Link>{" "}
              per our exchange policy.
            </p>
          </div>
        </div>
      </section>

      <ExchangeModal
        open={Boolean(exchangeOrderId)}
        onClose={() => setExchangeOrderId(null)}
        orderId={exchangeOrderId ?? ""}
      />
    </div>
  );
};

export default MyOrdersPage;
