import type { products } from "@wix/stores";

// Single source of truth for sold-out detection.
//
// Wix exposes stock state through three independent signals and the merchant
// can toggle any of them without touching the others:
//   1. `stock.inventoryStatus === "OUT_OF_STOCK"` — set when the merchant
//      flips the "Mark as out of stock" toggle on a product that doesn't
//      track inventory. This is the field that was being missed before.
//   2. `stock.inStock === false` — set on per-variant stock objects.
//   3. `stock.trackInventory === true && stock.quantity < 1` — when
//      inventory IS tracked and quantity hits zero.
//
// Any one of these being true means the product cannot be sold.
export function isProductOutOfStock(
  product: Pick<products.Product, "stock"> | null | undefined
): boolean {
  const stock = product?.stock;
  if (!stock) return false;
  if ((stock as any).inventoryStatus === "OUT_OF_STOCK") return true;
  if (stock.inStock === false) return true;
  if (stock.trackInventory === true && (stock.quantity ?? 0) < 1) return true;
  return false;
}
