"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Confetti from "react-confetti";
import { trackMetaEvent } from "@/lib/metaEvents";

const SuccessContent = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  const orderId = searchParams.get("orderId");

  // Lock the Confetti canvas to the actual viewport size. The previous hard-coded
  // 2000x1000 forced the page to be 2000px wide on phones, which is what broke
  // the mobile success layout (everything squeezed into the left half).
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const update = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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
        void trackMetaEvent("Purchase", {
          value,
          currency,
          content_ids,
          content_type: "product",
          transaction_id: orderId,
        });
        window.sessionStorage.setItem(firedKey, "1");
        window.sessionStorage.removeItem("vioraPendingPurchase");
      }
    } catch {}

    const timer = setTimeout(() => {
      router.push("/orders/" + orderId);
    }, 5000);

    return () => {
      clearTimeout(timer);
    };
  }, [orderId, router]);

  return (
    <div className="relative flex flex-col gap-4 md:gap-6 items-center justify-center text-center min-h-[calc(100vh-180px)] px-4 overflow-hidden">
      {size.width > 0 && (
        <div className="pointer-events-none fixed inset-0 z-0">
          <Confetti
            width={size.width}
            height={size.height}
            numberOfPieces={200}
            recycle={false}
          />
        </div>
      )}
      <h1 className="relative z-10 text-3xl sm:text-5xl md:text-6xl text-green-700 font-playfair">
        Order Placed Successfully!
      </h1>
      <h2 className="relative z-10 text-base md:text-xl font-medium">
        We&apos;ve sent the invoice to your email.
      </h2>
      <h3 className="relative z-10 text-sm md:text-base">
        Redirecting you to your order page...
      </h3>
    </div>
  );
};

const SuccessPage = () => {
  return (
    <Suspense fallback={
      <div className="flex flex-col gap-6 items-center justify-center h-[calc(100vh-180px)]">
        <div className="animate-pulse">
          <h1 className="text-6xl text-green-700">Processing...</h1>
        </div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
};

export default SuccessPage;
