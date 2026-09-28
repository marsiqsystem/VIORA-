"use client";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Confetti from "react-confetti";
import { trackMetaEvent } from "@/lib/metaEvents";
import { trackGa4Purchase } from "@/lib/ga4";
import { loadRazorpayScript } from "@/lib/razorpayClient";
import { COD_CHARGE, REVIEW_REWARD } from "@/lib/checkoutPricing";
import { deliveryWindowLabel, latestDeliveryLabel } from "@/lib/deliveryEstimate";
import { whatsappLink } from "@/lib/contact";
import { useWixClient } from "@/hooks/useWixClient";
import LoginModal from "@/components/LoginModal";
import { promptGoogleOneTap } from "@/components/GoogleOneTap";

type OrderSummary = {
  orderNumber: string;
  createdAt: number;
  firstName: string;
  paymentMode: "COD" | "PREPAID";
  paid: boolean;
  cancelled: boolean;
  total: number;
  items: { name: string; variant?: string; quantity: number; image?: string; price?: number }[];
  giftWrap: boolean;
  city: string;
  postalCode: string;
  phoneLast4: string;
  hasEmail: boolean;
  codCollect: number;
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

type SwitchState = "checking" | "offer" | "paying" | "done" | "unavailable" | "error";

/**
 * Right after a COD order: pay online now and skip the COD charge. Eligibility,
 * the amount and the Wix order update are all decided server-side
 * (src/lib/codSwitch.ts); this card only drives the Razorpay popup.
 */
const PayOnlineOffer = ({ orderId, onPaid }: { orderId: string; onPaid: () => void }) => {
  const [state, setState] = useState<SwitchState>("checking");
  const [payNow, setPayNow] = useState(0);
  const [codTotal, setCodTotal] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cod-switch?orderId=${encodeURIComponent(orderId)}`)
      .then((res) => res.json())
      .then((quote) => {
        if (cancelled) return;
        if (quote?.eligible) {
          setPayNow(Number(quote.payNow) || 0);
          setCodTotal(Number(quote.codTotal) || 0);
          setState("offer");
        } else {
          setState("unavailable");
        }
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const pay = async () => {
    setState("paying");
    setMessage("");
    try {
      const res = await fetch("/api/cod-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.order_id) throw new Error(data?.error || "Could not start the payment.");

      if (!(await loadRazorpayScript()) || !window.Razorpay) {
        throw new Error("Could not load the payment gateway. Check your connection and try again.");
      }

      const rzp = new window.Razorpay({
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        order_id: data.order_id,
        name: "Viora Jewels",
        description: "Pay online — COD charge waived",
        image: "/logo%20compressed.png",
        theme: { color: "#9B1B30" },
        handler: async (response: any) => {
          try {
            const confirm = await fetch("/api/cod-switch/confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const result = await confirm.json();
            if (!confirm.ok || !result?.ok) {
              throw new Error(result?.error || "We received your payment but couldn't update the order.");
            }
            setState("done");
            onPaid();
          } catch (err: any) {
            setMessage(
              `${err?.message || "Something went wrong."} Please WhatsApp us your payment ID ${response.razorpay_payment_id} — you won't be charged twice.`
            );
            setState("error");
          }
        },
        modal: { ondismiss: () => setState("offer") },
      });
      rzp.on("payment.failed", (resp: any) => {
        setMessage(resp?.error?.description || "Payment failed. Your COD order is still confirmed.");
        setState("offer");
      });
      rzp.open();
    } catch (err: any) {
      setMessage(err?.message || "Could not start the payment.");
      setState("offer");
    }
  };

  if (state === "checking" || state === "unavailable") return null;

  if (state === "done") {
    return (
      <div className="border-2 border-green-600 bg-green-50 p-4">
        <p className="font-semibold text-green-800">✓ Paid online — thank you!</p>
        <p className="mt-1 text-sm text-green-800">
          Your order is now prepaid and the ₹{COD_CHARGE} COD charge is waived. Nothing to pay on delivery.
        </p>
      </div>
    );
  }

  if (state === "error") {
    return <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>;
  }

  return (
    <div className="border-2 border-green-600 bg-white p-4 shadow-lg">
      <p className="text-[11px] font-bold uppercase tracking-wider text-green-700">
        Skip the COD charge · only before we ship
      </p>
      <p className="mt-1 text-lg font-bold text-primary">
        Pay {inr(payNow)} online now <span className="text-sm font-normal text-gray-400 line-through">{inr(codTotal)}</span>
      </p>
      <p className="mt-1 text-sm text-gray-600">
        Save ₹{COD_CHARGE}, and there&apos;s nothing to hand over at the door. UPI, cards &amp; more · Secured by Razorpay.
      </p>
      {message && <p className="mt-2 text-xs text-red-600">{message}</p>}
      <button
        type="button"
        onClick={pay}
        disabled={state === "paying"}
        className="mt-3 min-h-[48px] w-full bg-green-600 text-sm font-bold uppercase tracking-wider text-white hover:bg-green-700 disabled:opacity-60"
      >
        {state === "paying" ? "Opening payment…" : `Pay ${inr(payNow)} & save ₹${COD_CHARGE}`}
      </button>
      <p className="mt-2 text-center text-[11px] text-gray-500">Prefer cash? No action needed — your COD order is confirmed.</p>
    </div>
  );
};

const Step = ({ n, done, title, children }: { n: number; done?: boolean; title: string; children: React.ReactNode }) => (
  <li className="flex gap-3">
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center text-xs font-bold ${
        done ? "bg-green-600 text-white" : "border border-gray-300 bg-white text-primary"
      }`}
      aria-hidden="true"
    >
      {done ? "✓" : n}
    </span>
    <div className="pb-1">
      <p className="text-sm font-semibold text-primary">{title}</p>
      <p className="mt-0.5 text-[13px] leading-snug text-gray-600">{children}</p>
    </div>
  </li>
);

const SuccessContent = () => {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const codParam = searchParams.get("cod") === "1";

  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(!!orderId);
  const [switchedToOnline, setSwitchedToOnline] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const wixClient = useWixClient();
  // null until checked, so signed-in shoppers never see the sign-in card flash.
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    try {
      setLoggedIn(wixClient.auth.loggedIn());
    } catch {
      setLoggedIn(false);
    }
  }, [wixClient]);

  // Confetti canvas locked to the viewport (a fixed 2000px canvas once broke phones).
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    fetch(`/api/order-summary?orderId=${encodeURIComponent(orderId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && setSummary(data))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // Purchase tracking. The checkout fires both events before navigating here;
  // these are fallbacks for a checkout that got interrupted. Meta dedupes on the
  // event id, GA4 on transaction_id, and each has its own "fired" flag.
  useEffect(() => {
    if (!orderId) return;
    try {
      const stash = window.sessionStorage.getItem("vioraPendingPurchase");
      const parsed = stash ? JSON.parse(stash) : {};
      const value = Number(parsed.value) || 0;
      const currency = parsed.currency || "INR";
      const content_ids: string[] | undefined = Array.isArray(parsed.content_ids) ? parsed.content_ids : undefined;

      const metaKey = `viora_purchase_fired_${orderId}`;
      if (!window.sessionStorage.getItem(metaKey)) {
        void trackMetaEvent(
          "Purchase",
          { value, currency, content_ids, content_type: "product", transaction_id: orderId },
          `purchase_${orderId}`
        );
        window.sessionStorage.setItem(metaKey, "1");
      }
      const ga4Key = `viora_ga4_purchase_fired_${orderId}`;
      if (!window.sessionStorage.getItem(ga4Key)) {
        // gtag may still be loading on a fresh page load.
        window.setTimeout(() => trackGa4Purchase({ transactionId: orderId, value, currency, contentIds: content_ids }), 1500);
        window.sessionStorage.setItem(ga4Key, "1");
      }
      window.sessionStorage.removeItem("vioraPendingPurchase");
    } catch {}
  }, [orderId]);

  const isCod = summary ? summary.paymentMode === "COD" && !summary.paid && !switchedToOnline : codParam && !switchedToOnline;
  const placedAt = summary ? new Date(summary.createdAt) : new Date();
  const window_ = deliveryWindowLabel(placedAt);
  const latest = latestDeliveryLabel(placedAt);
  const ref = summary?.orderNumber ? `#${summary.orderNumber}` : "";
  const help = whatsappLink(`Hi Viora, I have a question about my order ${ref}`.trim());

  return (
    <div className="relative min-h-[calc(100vh-180px)] bg-platinum px-4 py-6 md:py-10">
      {size.width > 0 && (
        <div className="pointer-events-none fixed inset-0 z-0">
          <Confetti width={size.width} height={size.height} numberOfPieces={160} recycle={false} />
        </div>
      )}

      <div className="relative z-10 mx-auto flex max-w-xl flex-col gap-4">
        {/* Confirmation */}
        <section className="bg-white p-5 text-center shadow-sm md:p-8">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white" aria-hidden="true">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <h1 className="mt-3 font-playfair text-[28px] font-bold leading-tight text-primary md:text-4xl">
            {summary?.firstName ? `Thank you, ${summary.firstName}!` : "Thank you for your order!"}
          </h1>
          <p className="mt-1 text-[15px] text-gray-700">
            Your order {ref && <b className="text-primary">{ref}</b>} is confirmed.
          </p>
          {summary?.cancelled ? (
            <p className="mt-3 bg-red-50 px-3 py-2 text-sm text-red-700">This order has been cancelled. WhatsApp us if that&apos;s a mistake.</p>
          ) : (
            <p className="mt-3 inline-flex items-center gap-2 bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-800">
              🚚 Expected delivery: {window_}
            </p>
          )}
        </section>

        {isCod && orderId && !summary?.cancelled && (
          <PayOnlineOffer orderId={orderId} onPaid={() => setSwitchedToOnline(true)} />
        )}

        {/* What happens next — sets expectations so COD buyers are ready at the door */}
        {!summary?.cancelled && (
          <section className="bg-white p-5 shadow-sm">
            <h2 className="font-playfair text-xl font-bold text-primary">What happens next</h2>
            <ol className="mt-4 space-y-4">
              {isCod ? (
                <Step n={1} title="Confirm on WhatsApp">
                  We&apos;re sending your order details to WhatsApp{summary?.phoneLast4 ? ` (number ending ${summary.phoneLast4})` : ""}. Tap{" "}
                  <b>Confirm</b> to lock it in.
                </Step>
              ) : (
                <Step n={1} done title="Payment received">
                  {summary ? `${inr(summary.total)} paid online.` : "Your payment went through."} Nothing to pay on delivery.
                </Step>
              )}
              <Step n={2} title="Packed & shipped in 1–2 days">
                Every piece is checked before it&apos;s packed. Your tracking link comes on WhatsApp. Questions about your
                piece? Just reply to our WhatsApp message.
              </Step>
              {isCod ? (
                <Step n={3} title={`Keep ${summary?.codCollect ? inr(summary.codCollect) : "the amount"} ready`}>
                  Pay the courier in cash when it arrives — expected by {latest}.
                </Step>
              ) : (
                <Step n={3} title={`Delivered by ${latest}`}>
                  {summary?.city ? `To ${summary.city}${summary.postalCode ? ` – ${summary.postalCode}` : ""}.` : "Straight to your door."}
                </Step>
              )}
            </ol>
            <p className="mt-4 bg-platinum px-3 py-2.5 text-[13px] leading-snug text-gray-700">
              📞 <b className="text-primary">Expect a quick call from us today or tomorrow.</b> Our team personally confirms
              every order. Please pick up; it takes a minute and gets your order to you safely and on time.
            </p>
            {summary?.hasEmail !== false && (
              <p className="mt-4 border-t border-silver-light pt-3 text-xs text-gray-500">
                A confirmation email is on its way too — check Promotions or Spam if you don&apos;t see it.
              </p>
            )}
          </section>
        )}

        {/* Order summary */}
        {loading ? (
          <div className="h-32 animate-pulse bg-white" aria-label="Loading your order" />
        ) : summary && summary.items.length > 0 ? (
          <section className="bg-white p-5 shadow-sm">
            <h2 className="font-playfair text-xl font-bold text-primary">Your order {ref}</h2>
            <ul className="mt-3 divide-y divide-silver-light">
              {summary.items.map((item, i) => (
                <li key={i} className="flex items-center gap-3 py-3">
                  <span className="relative h-16 w-16 shrink-0 overflow-hidden bg-platinum">
                    {item.image && <Image src={item.image} alt="" fill sizes="64px" className="object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-primary">{item.name}</span>
                    <span className="block text-xs text-gray-500">
                      {[item.variant, `Qty ${item.quantity}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {item.price ? <span className="text-sm font-semibold text-primary">{inr(item.price)}</span> : null}
                </li>
              ))}
              {summary.giftWrap && (
                <li className="py-3 text-sm text-primary">🎁 Premium gift wrap included</li>
              )}
            </ul>
            {isCod && (
              <div className="flex items-center justify-between border-t border-silver-light py-2 text-sm text-gray-600">
                <span>Delivery + COD charge</span>
                <span>₹{COD_CHARGE}</span>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-silver-light pt-3">
              <span className="text-sm text-gray-600">{isCod ? "To pay on delivery" : "Paid online"}</span>
              <span className="font-playfair text-xl font-bold text-primary">
                {inr(isCod && summary.codCollect ? summary.codCollect : summary.total)}
              </span>
            </div>
          </section>
        ) : null}

        {/* Sign-in nudge: keeps every order in one place and unlocks the photo-review reward */}
        {loggedIn === false && !summary?.cancelled && (
          <section className="border border-silver-light bg-white p-5 text-center shadow-sm">
            <p className="font-playfair text-lg font-bold text-primary">Save this order to your account</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">
              One quick sign-in keeps all your orders and tracking in one place, and lets you post a photo review later.
            </p>
            <button
              type="button"
              onClick={() => {
                // Google one-tap; the email modal if the prompt can't show (cooldown / not signed into Google).
                if (!promptGoogleOneTap()) setLoginOpen(true);
              }}
              className="mx-auto mt-4 flex min-h-[48px] w-full max-w-xs items-center justify-center gap-3 border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-700 shadow-sm hover:shadow-md"
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
          </section>
        )}

        {/* Retention: the photo-review reward (applied after a logged-in photo review) */}
        <section className="bg-accent p-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">After it arrives</p>
          <p className="mt-1 text-lg font-bold leading-snug">
            Share a photo review, get ₹{REVIEW_REWARD.amount} off your next order
          </p>
          <p className="mt-1 text-sm text-white/85">
            Log in and post a photo on the product page — the code works on orders of ₹{REVIEW_REWARD.minimum}+.
          </p>
        </section>

        {/* Help + next */}
        <div className="grid gap-2 sm:grid-cols-2">
          <a
            href={help}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[48px] items-center justify-center gap-2 border border-green-600 bg-white text-sm font-semibold text-green-700 hover:bg-green-50"
          >
            💬 Questions? WhatsApp us
          </a>
          <Link
            href="/list"
            className="flex min-h-[48px] items-center justify-center bg-primary text-sm font-bold uppercase tracking-wider text-white hover:bg-accent"
          >
            Continue shopping
          </Link>
        </div>
        {summary && orderId && (
          <Link href={`/orders/${orderId}`} className="text-center text-sm font-semibold text-accent underline-offset-4 hover:underline">
            Track this order anytime →
          </Link>
        )}
      </div>

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLoggedIn={() => {
          setLoggedIn(true);
          setLoginOpen(false);
        }}
        noteTitle="🚚 Save your order"
        noteBody="Sign in to keep all your orders and tracking in one place, even after you close the website."
      />
    </div>
  );
};

const SuccessPage = () => (
  <Suspense
    fallback={
      <div className="flex min-h-[calc(100vh-180px)] items-center justify-center bg-platinum">
        <p className="animate-pulse font-playfair text-2xl text-green-700">Confirming your order…</p>
      </div>
    }
  >
    <SuccessContent />
  </Suspense>
);

export default SuccessPage;
