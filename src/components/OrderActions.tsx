"use client";

import { useState } from "react";
import ReviewModal from "./ReviewModal";
import ExchangeModal from "./ExchangeModal";

type Props = {
  orderId: string;
  variant: "mobile" | "desktop";
};

const OrderActions = ({ orderId, variant }: Props) => {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);

  const containerClass =
    variant === "mobile"
      ? "mt-3 grid grid-cols-2 gap-2"
      : "flex items-center justify-end gap-2";

  return (
    <>
      <div className={containerClass}>
        <button
          type="button"
          onClick={() => setReviewOpen(true)}
          className="rounded-md border border-accent px-3 py-2 text-xs font-semibold uppercase tracking-wider text-accent transition-colors hover:bg-accent hover:text-white"
        >
          Leave a Review
        </button>
        <button
          type="button"
          onClick={() => setExchangeOpen(true)}
          className="rounded-md border border-primary px-3 py-2 text-xs font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-white"
        >
          Exchange Request
        </button>
      </div>

      <ReviewModal open={reviewOpen} onClose={() => setReviewOpen(false)} />
      <ExchangeModal
        open={exchangeOpen}
        onClose={() => setExchangeOpen(false)}
        orderId={orderId}
      />
    </>
  );
};

export default OrderActions;
