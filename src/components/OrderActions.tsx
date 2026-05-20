"use client";

import { useState } from "react";
import ReviewModal from "./ReviewModal";
import ExchangeModal from "./ExchangeModal";

export type ReviewableLineItem = {
  productId: string;
  productName: string;
};

type Props = {
  orderId: string;
  variant: "mobile" | "desktop";
  lineItems?: ReviewableLineItem[];
};

const OrderActions = ({ orderId, variant, lineItems = [] }: Props) => {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<ReviewableLineItem | null>(null);

  const containerClass =
    variant === "mobile"
      ? "mt-3 grid grid-cols-2 gap-2"
      : "flex items-center justify-end gap-2";

  const handleReviewClick = () => {
    if (lineItems.length === 0) {
      // No items to review — open modal anyway; it will show a helpful message.
      setSelected(null);
      setReviewOpen(true);
      return;
    }
    if (lineItems.length === 1) {
      setSelected(lineItems[0]);
      setReviewOpen(true);
      return;
    }
    setPickerOpen(true);
  };

  const pickProduct = (item: ReviewableLineItem) => {
    setSelected(item);
    setPickerOpen(false);
    setReviewOpen(true);
  };

  return (
    <>
      <div className={containerClass}>
        <button
          type="button"
          onClick={handleReviewClick}
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

      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-playfair font-bold text-primary">
                Which product would you like to review?
              </h3>
              <button
                onClick={() => setPickerOpen(false)}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-700"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ul className="space-y-2 max-h-80 overflow-y-auto">
              {lineItems.map((item) => (
                <li key={item.productId}>
                  <button
                    type="button"
                    onClick={() => pickProduct(item)}
                    className="w-full text-left rounded-md border border-gray-200 px-3 py-2 text-sm text-primary hover:border-accent hover:bg-platinum/40 transition-colors"
                  >
                    {item.productName}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <ReviewModal
        open={reviewOpen}
        onClose={() => {
          setReviewOpen(false);
          setSelected(null);
        }}
        productId={selected?.productId}
        productName={selected?.productName}
      />
      <ExchangeModal
        open={exchangeOpen}
        onClose={() => setExchangeOpen(false)}
        orderId={orderId}
      />
    </>
  );
};

export default OrderActions;
