"use client";

import Cookies from "js-cookie";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import AccountTabs from "@/components/account/AccountTabs";
import { useWixClient } from "@/hooks/useWixClient";
import { updateUser, type UpdateUserState } from "@/lib/actions";
import {
  CLUB_VIORA_MINIMUM,
  CLUB_VIORA_PERCENT,
  CLUB_VIORA_PLUS_MINIMUM,
  CLUB_VIORA_PLUS_PERCENT,
  FESTIVE_COMBO,
  PREPAID_DISCOUNT,
  REVIEW_REWARD,
  isFestiveComboLive,
} from "@/lib/checkoutPricing";
import { whatsappLink } from "@/lib/contact";

const SaveButton = () => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[44px] bg-accent px-6 text-sm font-bold uppercase tracking-wide text-white hover:bg-primary disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save details"}
    </button>
  );
};

const inputClass = "mt-1 h-12 w-full border border-gray-300 bg-white px-3 text-base outline-none focus:border-accent";

const ProfileContent = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const wixClient = useWixClient();
  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [festive, setFestive] = useState(false);
  const [state, formAction] = useFormState<UpdateUserState, FormData>(updateUser, {});

  useEffect(() => {
    // Old links: the wishlist and orders used to be tabs on this page.
    const tab = searchParams.get("tab");
    if (tab === "wishlist") return router.replace("/wishlist");
    if (tab === "orders") return router.replace("/account/orders");

    if (!wixClient.auth.loggedIn()) {
      router.replace("/login?redirectTo=/profile");
      return;
    }
    setFestive(isFestiveComboLive());
    wixClient.members
      .getCurrentMember({ fieldsets: ["FULL"] } as any)
      .then((res) => setMember(res.member))
      .catch((err) => console.error("[profile] member load failed:", err))
      .finally(() => setLoading(false));
  }, [router, searchParams, wixClient]);

  const logout = async () => {
    setLoggingOut(true);
    Cookies.remove("refreshToken");
    try {
      const { logoutUrl } = await wixClient.auth.logout(window.location.origin);
      window.location.assign(logoutUrl);
    } catch {
      window.location.assign("/");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-platinum">
        <div className="loading-spinner h-8 w-8" />
      </div>
    );
  }

  const first = member?.contact?.firstName || "";
  const last = member?.contact?.lastName || "";
  const name = [first, last].filter(Boolean).join(" ") || member?.profile?.nickname || "";
  const email = member?.loginEmail || "";
  const phone = member?.contact?.phones?.[0] || "";

  const rewards = [
    ...(festive ? [{ title: `🪔 ₹${FESTIVE_COMBO.amount} OFF any 2 pieces`, sub: `Festive combo · till ${FESTIVE_COMBO.endLabel} · applied at checkout` }] : []),
    { title: `FREE delivery + ₹${PREPAID_DISCOUNT} OFF`, sub: "Every order you pay online" },
    { title: `${CLUB_VIORA_PERCENT}% OFF`, sub: `Bags of ₹${CLUB_VIORA_MINIMUM}+ · applied automatically` },
    {
      title: `${CLUB_VIORA_PLUS_PERCENT}% OFF`,
      sub: `Bags of ₹${CLUB_VIORA_PLUS_MINIMUM.toLocaleString("en-IN")}+ · applied automatically`,
    },
    {
      title: `₹${REVIEW_REWARD.amount} OFF your next order`,
      sub: `Post a photo review of a piece you bought · for orders of ₹${REVIEW_REWARD.minimum}+`,
    },
  ];

  return (
    <div className="min-h-screen bg-platinum px-4 pb-14 pt-5 text-primary md:px-6 md:pt-10 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <AccountTabs />

        <section className="flex items-center gap-4 bg-white p-5 shadow-sm">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent font-playfair text-2xl font-bold text-white">
            {(name || email || "V")[0].toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-playfair text-2xl font-bold">{name ? `Hi, ${first || name}` : "Your account"}</h1>
            <p className="truncate text-sm text-gray-600">{email}</p>
          </div>
        </section>

        <section className="bg-white p-5 shadow-sm">
          <h2 className="font-playfair text-xl font-bold">Your rewards</h2>
          <p className="mt-1 text-sm text-gray-600">No codes to remember — the bag applies these for you.</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {rewards.map((r) => (
              <li key={r.title} className="border border-dashed border-accent/40 bg-accent/5 px-4 py-3">
                <p className="text-sm font-bold text-accent">{r.title}</p>
                <p className="mt-0.5 text-xs text-gray-600">{r.sub}</p>
              </li>
            ))}
          </ul>
          <Link href="/list" className="mt-4 inline-flex h-11 items-center bg-primary px-5 text-sm font-bold uppercase tracking-wide text-white hover:bg-accent">
            Shop now
          </Link>
        </section>

        <section className="bg-white p-5 shadow-sm">
          <h2 className="font-playfair text-xl font-bold">Your details</h2>
          <p className="mt-1 text-sm text-gray-600">Used to fill in checkout faster.</p>
          <form action={formAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">First name</span>
              <input name="firstName" defaultValue={first} autoComplete="given-name" className={inputClass} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Last name</span>
              <input name="lastName" defaultValue={last} autoComplete="family-name" className={inputClass} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Mobile number</span>
              <input name="phone" type="tel" inputMode="numeric" defaultValue={phone} autoComplete="tel" className={inputClass} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Email</span>
              <input value={email} disabled className={`${inputClass} bg-platinum text-gray-500`} />
              <span className="mt-1 block text-xs text-gray-500">Your login email can&apos;t be changed here.</span>
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <SaveButton />
              {state.ok && <span className="text-sm font-medium text-green-700">✓ Saved</span>}
              {state.error && <span className="text-sm text-red-700">{state.error}</span>}
            </div>
          </form>
        </section>

        <section className="bg-white p-5 shadow-sm">
          <h2 className="font-playfair text-xl font-bold">Help &amp; privacy</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/track" className="font-semibold text-accent hover:underline">Track an order</Link>
            </li>
            <li>
              <Link href="/exchange-policy" className="font-semibold text-accent hover:underline">Exchange policy</Link>
            </li>
            <li>
              <a href={whatsappLink("Hi Viora, I need help with my account.")} target="_blank" rel="noopener noreferrer" className="font-semibold text-green-700 hover:underline">
                WhatsApp us
              </a>{" "}
              <span className="text-gray-600">— also to stop offer messages or delete your account.</span>
            </li>
          </ul>
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="mt-5 min-h-[44px] w-full border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 sm:w-auto sm:px-6"
          >
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </section>
      </div>
    </div>
  );
};

const ProfilePage = () => (
  <Suspense
    fallback={
      <div className="flex min-h-[60vh] items-center justify-center bg-platinum">
        <div className="loading-spinner h-8 w-8" />
      </div>
    }
  >
    <ProfileContent />
  </Suspense>
);

export default ProfilePage;
