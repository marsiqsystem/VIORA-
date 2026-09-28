"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useWixClient } from "@/hooks/useWixClient";
import { useCartStore } from "@/hooks/useCartStore";

/**
 * Landing page for the WhatsApp checkout reminder. WhatsApp usually opens links
 * in its own browser, where the shopper's cart doesn't exist — so rebuild it
 * from the saved checkout, then open checkout on the cart page.
 */
export default function RecoverCartPage({ params }: { params: { id: string } }) {
  const wixClient = useWixClient();
  const router = useRouter();
  const { getCart } = useCartStore();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/checkout-lead/${encodeURIComponent(params.id)}`);
        const data = await res.json();
        if (!res.ok || !data?.items?.length) throw new Error("Checkout link expired");

        const cart: any = await wixClient.currentCart.getCurrentCart().catch(() => null);
        const inCart = new Set(
          (cart?.lineItems || []).map((li: any) => li.catalogReference?.catalogItemId).filter(Boolean)
        );
        const lineItems = data.items.filter(
          (item: any) => !inCart.has(item.catalogReference?.catalogItemId)
        );
        if (lineItems.length) {
          await wixClient.currentCart.addToCurrentCart({ lineItems } as any);
        }
        await getCart(wixClient);
        if (!cancelled) router.replace("/cart?checkout=1");
      } catch (err) {
        console.warn("[recover] could not restore cart:", err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once for the link that was opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      {failed ? (
        <>
          <h1 className="font-playfair text-2xl font-bold text-primary">This checkout link has expired</h1>
          <p className="text-sm text-gray-600">Your pieces are still waiting in our shop.</p>
          <Link
            href="/list"
            className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-wider text-white"
          >
            Continue shopping
          </Link>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-gray-600">Bringing back your cart…</p>
        </>
      )}
    </div>
  );
}
