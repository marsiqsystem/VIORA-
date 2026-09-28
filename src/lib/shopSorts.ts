// Shop page sort + price options. Kept apart from shopData so client components can import them.

export type ShopSort = "popular" | "new" | "price-asc" | "price-desc";

export const SHOP_SORTS: { key: ShopSort; label: string }[] = [
  { key: "popular", label: "Most popular" },
  { key: "new", label: "Newest first" },
  { key: "price-asc", label: "Price: low to high" },
  { key: "price-desc", label: "Price: high to low" },
];

/** Price chips, on the price the shopper pays. `under`/`over` match the home page's shop-by-price links. */
export const PRICE_CHIPS = [
  { key: "u500", label: "Under ₹500", under: 499 },
  { key: "500s", label: "₹500–₹599", over: 499, under: 599 },
  { key: "600", label: "₹600 & above", over: 599 },
] as const;
