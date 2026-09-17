"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Confetti from "react-confetti";
import Link from "next/link";
import { trackMetaEvent } from "@/lib/metaEvents";
import { trackGa4Purchase } from "@/lib/ga4";
import { useWixClient } from "@/hooks/useWixClient";
import LoginModal from "@/components/LoginModal";
import { promptGoogleOneTap } from "@/components/GoogleOneTap";

const SuccessContent = () => {
  const searchParams = useSearchParams();
  const wixClient = useWixClient();

  const orderId = searchParams.get("orderId");

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  // Lock the Confetti canvas to the actual viewport size.
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const update = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Reflect current login state (so we swap the "log in" push for a
  // "track your order" button once the customer is signed in).
  useEffect(() => {
    try {
      setIsLoggedIn(wixClient.auth.loggedIn());
    } catch {
      setIsLoggedIn(false);
    }
  }, [wixClient]);

  // Fire Purchase (Pixel/CAPI) + GA4 purchase, exactly once per order.
  useEffect(() => {
    if (!orderId) return;
    const firedKey = `viora_purchase_fired_${orderId}`;
    try {
      if (!window.sessionStorage.getItem(firedKey)) {
        let value = 0;
        let currency = "INR";
        let content_ids: string[] | undefined;
        const stash = window.sessionStorage.getItem("vioraPendingPurchase");
        if (stash) {
          const parsed = JSON.parse(stash);
          value = Number(parsed.value) || 0;
          currency = parsed.currency || "INR";
          content_ids = Array.isArray(parsed.content_ids)
            ? parsed.content_ids
            : undefined;
        }
        void trackMetaEvent(
          "Purchase",
          {
            value,
            currency,
            content_ids,
            content_type: "product",
            transaction_id: orderId,
          },
          `purchase_${orderId}`
        );
        trackGa4Purchase({
          transactionId: orderId,
          value,
          currency,
          contentIds: content_ids,
        });
        window.sessionStorage.setItem(firedKey, "1");
        window.sessionStorage.removeItem("vioraPendingPurchase");
      }
    } catch {}
  }, [orderId]);

  // The site-wide Google one-tap (mounted in the layout) already pushes sign-in
  // on this page for signed-out customers, so we don't also auto-open the email
  // modal here — that would double-prompt. The inline card + "Continue with
  // Google" button remain for manual sign-in.

  return (
    <div className="relative min-h-[calc(100vh-140px)] w-full overflow-hidden bg-platinum px-4 py-10 md:py-14">
      {size.width > 0 && (
        <div className="pointer-events-none fixed inset-0 z-0">
          <Confetti
            width={size.width}
            height={size.height}
            numberOfPieces={220}
            recycle={false}
          />
        </div>
      )}

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-5">
        {/* Hero */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-9 w-9 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.4}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="font-playfair text-3xl font-bold text-primary md:text-4xl">
            Order Confirmed! 🎉
          </h1>
          <p className="mt-2 text-sm text-gray-600 md:text-base">
            Thank you for shopping with Viora. Your order has been placed
            successfully{orderId ? "." : "."}
          </p>
          {orderId && (
            <p className="mt-1 text-xs text-gray-400">
              Order reference: <span className="font-medium text-gray-600">{orderId}</span>
            </p>
          )}
        </div>

        {/* WhatsApp confirmation */}
        <div className="rounded-2xl border border-[#25D366]/30 bg-white p-5 shadow-premium">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📱</span>
            <div>
              <p className="font-semibold text-primary">
                We&apos;ve sent your order confirmation to your WhatsApp
              </p>
              <p className="mt-1 text-sm text-gray-600">
                All your updates — confirmation, dispatch and tracking — will
                come straight to your WhatsApp. Your invoice has also been
                emailed to you (do check spam/promotions if you can&apos;t find it).
              </p>
              <p className="mt-2 rounded-lg bg-[#25D366]/10 px-3 py-2 text-sm font-medium text-[#0b7a45]">
                💬 Any question about your product? Just <b>reply to our order
                confirmation message on WhatsApp</b> — we&apos;re right there to help you.
              </p>
            </div>
          </div>
        </div>

        {/* Login push */}
        {isLoggedIn ? (
          <Link
            href={orderId ? `/orders/${orderId}` : "/account/orders"}
            className="rounded-2xl bg-accent px-5 py-4 text-center text-sm font-semibold uppercase tracking-wider text-white shadow-premium transition-colors hover:bg-primary"
          >
            Track your order →
          </Link>
        ) : (
          <div className="rounded-2xl border-2 border-accent/25 bg-gradient-to-br from-[#9B1B30]/5 via-white to-[#9B1B30]/5 p-5 text-center shadow-premium">
            <p className="font-playfair text-lg font-semibold text-primary">
              Log in to track your order &amp; save it forever
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">
              One quick sign-in lets you follow your order live, view your
              tracking ID, and reorder anytime — no details to remember.
            </p>
            {/* Real Google one-tap; falls back to the email modal if the
                one-tap prompt can't be shown (cooldown / not signed into Google). */}
            <button
              type="button"
              onClick={() => {
                if (!promptGoogleOneTap()) setLoginOpen(true);
              }}
              className="mx-auto mt-4 flex w-full max-w-xs items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-shadow hover:shadow-md"
            >
              <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.4 36 44 30.5 44 24c0-1.3-.1-2.3-.4-3.5z" />
              </svg>
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="mt-3 text-xs font-medium text-accent underline hover:text-primary"
            >
              or log in with email
            </button>
          </div>
        )}

        {/* Confirmation call — reassurance + flattery */}
        <div className="rounded-2xl border border-silver-light/35 bg-white p-5 shadow-premium">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📞</span>
            <div>
              <p className="font-semibold text-primary">
                Expect a quick call from us — today or tomorrow
              </p>
              <p className="mt-1 text-sm text-gray-600">
                Every Viora customer is special to us ❤️. That&apos;s why our
                team personally calls to confirm each order and make sure your
                delivery experience is smooth and perfect from start to finish.
                Please do pick up — it only takes a minute and helps us get your
                order to you safely and on time.
              </p>
            </div>
          </div>
        </div>

        {/* Tracking info */}
        <div className="rounded-2xl border border-silver-light/35 bg-white p-5 shadow-premium">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🚚</span>
            <div>
              <p className="font-semibold text-primary">Track everything, anywhere</p>
              <p className="mt-1 text-sm text-gray-600">
                You&apos;ll receive your <b>tracking ID</b> the moment your order
                ships — both here on the website (under your orders) and on
                WhatsApp. Stay logged in and you can check your order status
                anytime, in one tap.
              </p>
            </div>
          </div>
        </div>

        {/* Trust banner — Viora Family */}
        <div className="rounded-2xl border-2 border-accent/20 bg-gradient-to-br from-[#9B1B30]/5 via-white to-[#9B1B30]/5 p-5 text-center shadow-premium">
          <p className="font-playfair text-lg font-semibold text-primary">
            You&apos;re part of the Viora Family now ❤️
          </p>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-gray-700">
            Out of <b>300+ orders</b>, only 2–3 ever needed an exchange — every
            other customer received their piece exactly as shown and absolutely
            loved it. This is <b>100% genuine</b>. You&apos;ll receive the
            product exactly as pictured — no surprises, no fraud, just Viora.
          </p>
          <p className="mt-3 text-xs font-medium uppercase tracking-wider text-accent">
            Handpicked · Quality checked · Delivered with care
          </p>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col items-center gap-3 pt-1 sm:flex-row sm:justify-center">
          <Link
            href="/products"
            className="text-sm font-medium text-accent underline hover:text-primary"
          >
            Continue shopping
          </Link>
        </div>
      </div>

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLoggedIn={() => {
          setIsLoggedIn(true);
          setLoginOpen(false);
        }}
        noteTitle="🚚 Track & Save Your Order"
        noteBody="Log in to follow your order live, see your tracking ID, and keep all your orders in one place — even after you close the website."
      />
    </div>
  );
};

const SuccessPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-140px)] flex-col items-center justify-center bg-platinum">
          <h1 className="animate-pulse font-playfair text-4xl text-green-700">
            Processing...
          </h1>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
};

export default SuccessPage;
