import { wixClientServer } from "@/lib/wixClientServer";
import { products } from "@wix/stores";
import ProductSlider from "./ProductSlider";

/**
 * "You May Also Like" — fetches up to 5 alternative products that share a
 * collection with the current product, excluding the current product (and its
 * own colour variants) so the slider always shows genuinely different items.
 */
const RelatedProducts = async ({
  currentProductId,
  currentName,
  collectionIds,
}: {
  currentProductId: string;
  currentName: string;
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

  // Exclude the current product and its colour siblings (same base name),
  // then dedupe remaining products to one card per base name.
  const currentBase = (currentName || "").split(" - ")[0].trim().toLowerCase();
  const seenBases = new Set<string>();
  const picked: products.Product[] = [];

  for (const product of items) {
    if (product._id === currentProductId) continue;
    if (product.visible === false) continue;

    const base = (product.name || "").split(" - ")[0].trim().toLowerCase();
    if (base && base === currentBase) continue; // skip the current product's variants
    const key = base || product._id || "";
    if (seenBases.has(key)) continue;

    seenBases.add(key);
    picked.push(product);
    if (picked.length >= 5) break;
  }

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
