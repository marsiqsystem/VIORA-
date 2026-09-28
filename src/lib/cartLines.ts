// Helpers for Wix cart line items shared by the bag and checkout.

/** The paid gift-wrap line, as CheckoutUpsell adds it ("Premium Gift Packaging"). */
export const isGiftWrapLine = (li: any) =>
  String(li?.productName?.original || "").toLowerCase().includes("gift packaging");

/** Fee lines (gift wrap and other services) — not products. */
export const isServiceLine = (li: any) =>
  String(li?.itemType?.preset || "").toUpperCase() === "SERVICE" || isGiftWrapLine(li);

export const lineTotal = (li: any) => (Number(li?.price?.amount) || 0) * (li?.quantity || 1);

/** Units Wix says are left, when it's low enough to be worth saying. */
export const lowStockLeft = (li: any, threshold = 5): number | null => {
  const left = li?.availability?.quantityAvailable;
  return typeof left === "number" && left > 0 && left <= threshold ? left : null;
};

/** ₹ amount without trailing ".00", but keeping paise when there are any. */
export const rupees = (n: number) =>
  Number.isInteger(Math.round(n * 100) / 100) ? String(Math.round(n)) : n.toFixed(2);
