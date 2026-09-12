import { wixClientServer } from "@/lib/wixClientServer";
import { products } from "@wix/stores";
import ProductSlider from "./ProductSlider";

/**
 * "You May Also Like" — fetches up to 5 alternative products that share a
 * collection with the current product, excluding the current product (and its
 * own colour variants) so the slider always shows genuinely different items.
 */
// Split "Base Name - Colour" into its two parts (mirrors the product page).
const splitBaseAndColor = (name: string): { base: string; color: string } => {
  const idx = (name || "").indexOf(" - ");
  if (idx === -1) return { base: (name || "").trim(), color: "" };
  return { base: name.slice(0, idx).trim(), color: name.slice(idx + 3).trim() };
};

const RelatedProducts = async ({
  currentProductId,
  currentName,
  currentColor = "",
  collectionIds,
}: {
  currentProductId: string;
  currentName: string;
  currentColor?: string;
  collectionIds: string[];
}) => {
  if (!collectionIds?.length) return null;

  let items: products.Product[] = [];
  try {
    const wixClient = await wixClientServer();
    const res = await wixClient.products
      .queryProducts()
      .hasSome("collectionIds", collectionIds)
      .limit(40)
      .find();
    items = res.items;
  } catch (err) {
    console.error("[RelatedProducts] Wix fetch failed:", err);
    return null;
  }

  // Colour-relevant recommendations: when the shopper is on a blue piece, the
  // "You May Also Like" row should lead with OTHER products in blue, not a
  // random mix. We group candidates by base name (one card per product),
  // preferring the variant whose colour matches the current one, and order the
  // final list so colour-matched products come first — then fall back to other
  // products so the row is never left short.
  const wantColor = (currentColor || splitBaseAndColor(currentName).color)
    .trim()
    .toLowerCase();
  const currentBase = splitBaseAndColor(currentName).base.toLowerCase();

  type Group = { colorMatch?: products.Product; fallback?: products.Product };
  const groups = new Map<string, Group>();
  const order: string[] = [];

  for (const product of items) {
    if (product._id === currentProductId) continue;
    if (product.visible === false) continue;

    const { base, color } = splitBaseAndColor(product.name || "");
    const baseKey = (base || product._id || "").toLowerCase();
    if (baseKey === currentBase) continue; // skip the current product's own variants

    if (!groups.has(baseKey)) {
      groups.set(baseKey, {});
      order.push(baseKey);
    }
    const g = groups.get(baseKey)!;
    if (wantColor && color.toLowerCase() === wantColor) {
      if (!g.colorMatch) g.colorMatch = product; // this base has the wanted colour
    } else if (!g.fallback) {
      g.fallback = product; // remember any variant as a fallback
    }
  }

  // One card per base: colour-matched bases first (relevant), the rest after.
  const matched: products.Product[] = [];
  const others: products.Product[] = [];
  for (const key of order) {
    const g = groups.get(key)!;
    if (g.colorMatch) matched.push(g.colorMatch);
    else if (g.fallback) others.push(g.fallback);
  }
  const picked = [...matched, ...others].slice(0, 5);

  if (picked.length === 0) return null;

  return (
    <section className="container-responsive border-t border-gray-100 py-10 lg:py-14">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-accent">
            Curated for you
          </p>
          <h2 className="font-playfair text-2xl font-bold text-primary md:text-3xl">
            You May Also Like
          </h2>
        </div>
      </div>

      <ProductSlider items={picked} />
    </section>
  );
};

export default RelatedProducts;
