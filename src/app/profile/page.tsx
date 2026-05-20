"use client";

import UpdateButton from "@/components/UpdateButton";
import { updateUser } from "@/lib/actions";
import { useWixClient } from "@/hooks/useWixClient";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { format } from "timeago.js";
import BackButton from "@/components/BackButton";
import { useWishlistStore } from "@/hooks/useWishlistStore";

const ProfileContent = () => {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "profile";
  const wixClient = useWixClient();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const wishlistItems = useWishlistStore((s) => s.items);
  const wishlistHydrated = useWishlistStore((s) => s.hasHydrated);
  const removeFromWishlist = useWishlistStore((s) => s.remove);

  useEffect(() => {
    const fetchData = async () => {
      if (!wixClient.auth.loggedIn()) {
        setUser(null);
        setOrders([]);
        setLoading(false);
        const redirectTo = `/profile${activeTab === "profile" ? "" : `?tab=${activeTab}`}`;
        router.replace(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
        return;
      }

      try {
        const memberData = await wixClient.members.getCurrentMember({
          fieldsets: ["FULL"],
        } as any);
        setUser(memberData.member);

        if (memberData.member?.contactId) {
          const orderRes = await wixClient.orders.searchOrders({
            filter: { "buyerInfo.contactId": { $eq: memberData.member.contactId } },
          });
          setOrders(orderRes.orders || []);
        }
      } catch (error) {
        console.error("Error fetching profile data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeTab, router, wixClient]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="loading-spinner w-8 h-8"></div>
      </div>
    );
  }

  if (!user?.contactId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-playfair font-bold text-primary mb-4">Not Logged In</h2>
          <p className="text-gray-600 mb-6">Please log in to view your profile</p>
          <Link href="/login" className="btn-primary">
            Login
          </Link>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "profile", label: "Profile", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
    { id: "orders", label: "Orders", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
    { id: "wishlist", label: "Wishlist", icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" },
    { id: "coupons", label: "Coupons", icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" },
    { id: "giftcards", label: "Gift Cards", icon: "M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" },
    { id: "settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-viora-gradient py-12 md:py-16">
        <div className="container-responsive">
          <div className="mb-6 flex items-center gap-2">
            <BackButton className="bg-white shadow-sm" />
            <span className="text-sm font-medium text-gray-500">Back</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white flex items-center justify-center shadow-premium">
              <span className="text-3xl md:text-4xl font-playfair font-bold text-primary">
                {user?.profile?.nickname?.[0]?.toUpperCase() || user?.contact?.firstName?.[0]?.toUpperCase() || "U"}
              </span>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-playfair font-bold text-primary">
                {user?.profile?.nickname || `${user?.contact?.firstName || ""} ${user?.contact?.lastName || ""}`.trim() || "Welcome"}
              </h1>
              <p className="text-gray-600 mt-1">{user?.loginEmail}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container-responsive py-8">
        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-8 scrollbar-hide">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={`/profile${tab.id === "profile" ? "" : `?tab=${tab.id}`}`}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg whitespace-nowrap transition-all duration-200 ${activeTab === tab.id
                  ? "bg-primary text-white shadow-md"
                  : "bg-white text-gray-600 hover:bg-silver-light"
                }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={tab.icon} />
              </svg>
              <span className="text-sm font-medium">{tab.label}</span>
            </Link>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-xl shadow-premium p-6 md:p-8">
          {activeTab === "profile" && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-playfair font-bold text-primary mb-6">Profile Information</h2>
              <form action={updateUser} className="grid md:grid-cols-2 gap-6 max-w-2xl">
                <input type="text" hidden name="id" defaultValue={user?.contactId} />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                  <input
                    type="text"
                    name="username"
                    placeholder={user?.profile?.nickname || "Enter username"}
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                  <input
                    type="text"
                    name="firstName"
                    placeholder={user?.contact?.firstName || "Enter first name"}
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                  <input
                    type="text"
                    name="lastName"
                    placeholder={user?.contact?.lastName || "Enter last name"}
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                  <input
                    type="text"
                    name="phone"
                    placeholder={user?.contact?.phones?.[0] || "Enter phone number"}
                    className="input"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    name="email"
                    placeholder={user?.loginEmail || "Enter email"}
                    className="input"
                    disabled
                  />
                  <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                </div>

                <div className="md:col-span-2">
                  <UpdateButton />
                </div>
              </form>
            </div>
          )}

          {activeTab === "orders" && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-playfair font-bold text-primary mb-6">My Orders</h2>
              {orders.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <p className="text-gray-500 mb-4">No orders yet</p>
                  <Link href="/list" className="btn-primary">Start Shopping</Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <Link
                      href={`/orders/${order._id}`}
                      key={order._id}
                      className="block p-4 rounded-lg border border-gray-200 hover:border-silver hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Order ID</p>
                          <p className="font-medium text-primary">{order._id?.substring(0, 12)}...</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Amount</p>
                          <p className="font-medium text-primary">₹{order.priceSummary?.subtotal?.amount}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Date</p>
                          <p className="font-medium text-primary">{order._createdDate ? format(order._createdDate) : "N/A"}</p>
                        </div>
                        <div>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${order.status === "FULFILLED" ? "bg-green-100 text-green-700" :
                              order.status === "PENDING" ? "bg-yellow-100 text-yellow-700" :
                                "bg-gray-100 text-gray-700"
                            }`}>
                            {order.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "wishlist" && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-playfair font-bold text-primary mb-6">My Wishlist</h2>
              {!wishlistHydrated ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  Loading your wishlist...
                </div>
              ) : wishlistItems.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  <p className="text-gray-500 mb-4">Your wishlist is empty</p>
                  <Link href="/list" className="btn-primary">Explore Products</Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {wishlistItems.map((item) => (
                    <div
                      key={item.id}
                      className="group relative rounded-lg border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow"
                    >
                      <Link href={`/${item.slug}`} className="block">
                        <div className="relative aspect-[3/4] bg-gray-50">
                          <Image
                            src={item.image}
                            alt={item.name}
                            fill
                            sizes="(max-width: 768px) 50vw, 25vw"
                            className="object-cover"
                          />
                        </div>
                        <div className="p-3">
                          <h3 className="text-sm font-medium text-gray-800 line-clamp-2">
                            {item.name.split(" - ")[0].trim()}
                          </h3>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-sm font-bold text-accent">₹{item.price}</span>
                            {item.fullPrice && item.fullPrice > item.price && (
                              <span className="text-xs text-gray-400 line-through">
                                ₹{item.fullPrice}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeFromWishlist(item.id)}
                        aria-label="Remove from wishlist"
                        title="Remove from wishlist"
                        className="absolute top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white shadow text-gray-500 hover:text-red-600 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "coupons" && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-playfair font-bold text-primary mb-6">Coupons & Offers</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border-2 border-dashed border-silver bg-silver-light/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg font-bold text-primary">WELCOME10</span>
                    <span className="badge badge-new">New User</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">Get 10% off on your first order</p>
                  <button className="text-sm font-medium text-primary hover:underline">Copy Code</button>
                </div>
                <div className="p-4 rounded-lg border-2 border-dashed border-silver bg-silver-light/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg font-bold text-primary">FREESHIP</span>
                    <span className="badge badge-bestseller">Popular</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">Free shipping on orders above ₹999</p>
                  <button className="text-sm font-medium text-primary hover:underline">Copy Code</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "giftcards" && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-playfair font-bold text-primary mb-6">Gift Cards</h2>
              <div className="text-center py-12">
                <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                </svg>
                <p className="text-gray-500 mb-4">No gift cards available</p>
                <button className="btn-secondary">Buy Gift Card</button>
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="animate-fade-in">
              <h2 className="text-xl font-playfair font-bold text-primary mb-6">Account Settings</h2>
              <div className="space-y-4 max-w-2xl">
                <div className="p-4 rounded-lg border border-gray-200 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-primary">Email Notifications</p>
                    <p className="text-sm text-gray-500">Receive updates about your orders</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
                <div className="p-4 rounded-lg border border-gray-200 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-primary">SMS Notifications</p>
                    <p className="text-sm text-gray-500">Receive delivery updates via SMS</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
                <div className="p-4 rounded-lg border border-gray-200 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-primary">Promotional Emails</p>
                    <p className="text-sm text-gray-500">Receive offers and promotions</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ProfilePage = () => {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="loading-spinner w-8 h-8"></div>
      </div>
    }>
      <ProfileContent />
    </Suspense>
  );
};

export default ProfilePage;

