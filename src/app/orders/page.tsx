import { wixClientServer } from "@/lib/wixClientServer";
import Link from "next/link";
import { format } from "timeago.js";
import OrderActions from "@/components/OrderActions";

export const dynamic = "force-dynamic";

const OrdersPage = async () => {
    const wixClient = await wixClientServer();

    let orders: any[] = [];
    try {
        const response = await wixClient.orders.searchOrders({});
        orders = response.orders || [];
    } catch (err) {
        console.error("Failed to fetch orders:", err);
    }

    return (
        <div className="min-h-[calc(100vh-180px)] px-4 md:px-8 lg:px-16 xl:px-32 2xl:px-64 py-12">
            <h1 className="text-3xl font-semibold mb-8">Order History</h1>

            {orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-6">
                    <div className="text-gray-400 text-6xl">📦</div>
                    <h2 className="text-xl text-gray-600">No orders yet</h2>
                    <p className="text-gray-500">
                        When you place orders, they will appear here.
                    </p>
                    <Link
                        href="/list"
                        className="mt-4 bg-accent text-white py-3 px-8 rounded-md hover:bg-opacity-90 transition-colors"
                    >
                        Start Shopping
                    </Link>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Desktop Header */}
                    <div className="hidden md:grid grid-cols-5 gap-4 pb-4 border-b text-sm font-medium text-gray-500">
                        <div>Order ID</div>
                        <div>Date</div>
                        <div>Status</div>
                        <div>Total</div>
                        <div className="text-right">Actions</div>
                    </div>

                    {/* Orders List */}
                    {orders.map((order) => (
                        <div
                            key={order._id}
                            className="bg-white border rounded-lg p-4 md:p-0 md:border-0 md:bg-transparent"
                        >
                            {/* Mobile View */}
                            <div className="md:hidden space-y-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-sm text-gray-500">Order ID</p>
                                        <p className="font-medium text-sm">
                                            #{order._id?.slice(-8)}
                                        </p>
                                    </div>
                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-medium ${order.status === "FULFILLED"
                                            ? "bg-green-100 text-green-700"
                                            : order.status === "CANCELED"
                                                ? "bg-red-100 text-red-700"
                                                : "bg-yellow-100 text-yellow-700"
                                            }`}
                                    >
                                        {order.status?.replace(/_/g, " ")}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <div>
                                        <p className="text-sm text-gray-500">Date</p>
                                        <p className="font-medium">{format(order._createdDate)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm text-gray-500">Total</p>
                                        <p className="font-semibold">
                                            ₹{order.priceSummary?.total?.amount || "0.00"}
                                        </p>
                                    </div>
                                </div>
                                <Link
                                    href={`/orders/${order._id}`}
                                    className="block w-full text-center py-2 mt-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                                >
                                    View Details
                                </Link>
                                {order.status === "FULFILLED" && (
                                    <OrderActions orderId={order._id} variant="mobile" />
                                )}
                            </div>

                            {/* Desktop View */}
                            <div className="hidden md:grid grid-cols-5 gap-4 py-4 border-b items-center">
                                <div>
                                    <p className="font-medium">#{order._id?.slice(-8)}</p>
                                </div>
                                <div className="text-gray-600">{format(order._createdDate)}</div>
                                <div>
                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-medium ${order.status === "FULFILLED"
                                            ? "bg-green-100 text-green-700"
                                            : order.status === "CANCELED"
                                                ? "bg-red-100 text-red-700"
                                                : "bg-yellow-100 text-yellow-700"
                                            }`}
                                    >
                                        {order.status?.replace(/_/g, " ")}
                                    </span>
                                </div>
                                <div className="font-semibold">
                                    ₹{order.priceSummary?.total?.amount || "0.00"}
                                </div>
                                <div className="text-right">
                                    <Link
                                        href={`/orders/${order._id}`}
                                        className="text-accent hover:underline font-medium"
                                    >
                                        View Details →
                                    </Link>
                                </div>
                            </div>
                            {order.status === "FULFILLED" && (
                                <div className="hidden md:block pb-4 -mt-2">
                                    <OrderActions orderId={order._id} variant="desktop" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default OrdersPage;
