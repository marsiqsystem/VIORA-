"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export type AbandonedCartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  abandonedItems: AbandonedCartItem[];
  currentProductPrice: number;
  // "yes" — keep abandoned items + add the current product, then go to checkout.
  // "no"  — remove abandoned items from cart, add only the current product, go to checkout.
  onDecision: (decision: "yes" | "no") => Promise<void> | void;
};

const SHINE50_MIN = 700;
const CLUBVIORA_MIN = 999;

const BuyNowConfirmModal = ({
  open,
  onClose,
  abandonedItems,
  currentProductPrice,
  onDecision,
}: Props) => {
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState<null | "yes" | "no">(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  const abandonedSubtotal = useMemo(
    () =>
      abandonedItems.reduce(
        (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
        0
      ),
    [abandonedItems]
  );

  const combinedSubtotal = abandonedSubtotal + currentProductPrice;

  // Smart coupon nudge: pick the best coupon the customer becomes eligible for
  // by adding the abandoned items along with the current one.
  const couponNudge = useMemo(() => {
    if (combinedSubtotal >= CLUBVIORA_MIN && currentProductPrice < CLUBVIORA_MIN) {
      const saving = Math.round(combinedSubtotal * 0.1);
      return {
        code: "CLUBVIORA",
        label: `Unlock 10% OFF (≈ ₹${saving} savings) with code CLUBVIORA`,
      };
    }
    if (combinedSubtotal >= SHINE50_MIN && currentProductPrice < SHINE50_MIN) {
      return {
        code: "SHINE50",
        label: "Unlock ₹50 OFF with code SHINE50",
      };
    }
    return null;
  }, [combinedSubtotal, currentProductPrice]);

  const handle = async (decision: "yes" | "no") => {
    if (busy) return;
    setBusy(decision);
    try {
      await onDecision(decision);
    } finally {
      setBusy(null);
    }
  };

  if (!mounted || !open) return null;

  const firstItemName = abandonedItems[0]?.name || "an item";
  const more = abandonedItems.length - 1;

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/55 md:items-center"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm Buy Now"
      data-lenis-prevent
    >
      <div
        className="relative w-full md:max-w-md max-h-[95vh] overflow-y-auto rounded-t-2xl md:rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#1A1410]">
            Just a quick check
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={!!busy}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-[#1A1410]/85 leading-relaxed">
            You already have{" "}
            <span className="font-semibold">
              {firstItemName}
              {more > 0 ? ` & ${more} more item${more > 1 ? "s" : ""}` : ""}
            </span>{" "}
            in your cart. Would you like to add them to this order too?
          </p>

          <div className="space-y-2 max-h-56 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/60 p-2">
            {abandonedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-md bg-white p-2 border border-gray-100"
              >
                <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#1A1410]">
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    Qty {item.quantity} · ₹{item.price}
                  </p>
                </div>
                <p className="text-sm font-semibold text-[#1A1410]">
                  ₹{(item.price * item.quantity).toFixed(0)}
                </p>
              </div>
            ))}
          </div>

          {couponNudge && (
            <div className="rounded-lg border border-green-200 bg-green-50/70 p-3 flex items-start gap-2">
              <svg
                className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm font-medium text-green-800">
                {couponNudge.label}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={() => handle("yes")}
              disabled={!!busy}
              className="w-full rounded-lg bg-[#9B1B30] py-3 text-sm font-semibold uppercase tracking-wider text-white hover:bg-[#7d1527] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "yes" ? "Adding…" : "Yes, add to my order"}
            </button>
            <button
              type="button"
              onClick={() => handle("no")}
              disabled={!!busy}
              className="w-full rounded-lg border-2 border-[#9B1B30] py-3 text-sm font-semibold uppercase tracking-wider text-[#9B1B30] hover:bg-[#9B1B30]/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "no" ? "Please wait…" : "No, just buy this one"}
            </button>
          </div>

          <p className="text-[11px] text-gray-500 text-center">
            Choosing &ldquo;No&rdquo; will remove the other item
            {abandonedItems.length > 1 ? "s" : ""} from your cart so only the
            item you&apos;re buying now is charged.
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default BuyNowConfirmModal;
