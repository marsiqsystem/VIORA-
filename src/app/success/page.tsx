"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import Confetti from "react-confetti";
import { trackPurchase } from "@/lib/metaPixel";

const SuccessContent = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  const orderId = searchParams.get("orderId");

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
        trackPurchase(value, currency, content_ids, orderId);
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
    <div className="flex flex-col gap-6 items-center justify-center h-[calc(100vh-180px)]">
      <Confetti width={2000} height={1000} />
      <h1 className="text-6xl text-green-700">Successful</h1>
      <h2 className="text-xl font-medium">
        We sent the invoice to your e-mail
      </h2>
      <h3 className="">You are being redirected to the order page...</h3>
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

