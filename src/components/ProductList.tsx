import { wixClientServer } from "@/lib/wixClientServer";
import { products } from "@wix/stores";
import Link from "next/link";
import dynamic from "next/dynamic";
import ProductCard from "./ProductCard";

const Pagination = dynamic(() => import("../components/Pagination"), {
  ssr: false,
});
const PRODUCT_PER_PAGE = 8;

const ProductList = async ({
  categoryId,
  limit,
  searchParams,
}: {
  categoryId: string;
  limit?: number;
  searchParams?: any;
}) => {
  const wixClient = await wixClientServer();

  let productQuery = wixClient.products
    .queryProducts()
    .startsWith("name", searchParams?.q || "")
    .hasSome(
      "productType",
      searchParams?.type ? [searchParams.type] : ["physical", "digital"]
    )
    .gt("priceData.price", searchParams?.min || 0)
    .lt("priceData.price", searchParams?.max || 999999);

  if (categoryId && categoryId !== "00000000-000000-000000-000000000001") {
    productQuery = productQuery.hasSome("collectionIds", [categoryId]);
  }

  if (searchParams?.sort) {
    const [sortType, sortBy] = searchParams.sort.split(" ");
    if (sortType === "asc") productQuery = productQuery.ascending(sortBy);
    if (sortType === "desc") productQuery = productQuery.descending(sortBy);
  }

  const pageSize = limit || PRODUCT_PER_PAGE;
  // Over-fetch so dedupe by Base Name still leaves a full page after collapsing
  // color variants. Wix doesn't expose server-side group-by; this is the
  // pragmatic workaround for the 15-image-per-product constraint.
  const OVERFETCH_FACTOR = 4;
  productQuery = productQuery
    .limit(pageSize * OVERFETCH_FACTOR)
    .skip(
      searchParams?.page
        ? parseInt(searchParams.page) * pageSize * OVERFETCH_FACTOR
        : 0
    );

  const res = await productQuery.find();

  // Group color variants by Base Name (everything before " - ").
  // Convention: "[Base Name] - [Color]" (e.g. "Ethnic Jewellery Set - Blue").
  // We render only the FIRST product seen per base name to keep the grid clean.
  const dedupedItems: products.Product[] = [];
  const seenBaseNames = new Set<string>();
  for (const item of res.items) {
    const baseName = (item.name || "").split(" - ")[0].trim().toLowerCase();
    if (!baseName) {
      dedupedItems.push(item);
      continue;
    }
    if (seenBaseNames.has(baseName)) continue;
    seenBaseNames.add(baseName);
    dedupedItems.push(item);
    if (dedupedItems.length >= pageSize) break;
  }

  return (
    <div className="mt-12">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-4 lg:gap-8">
        {dedupedItems.map((product: products.Product, index: number) => {
          return <ProductCard key={product._id} product={product} index={index} />;
        })}
      </div>

      {dedupedItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <h3 className="text-xl font-medium text-gray-700 mb-2">
            No products found
          </h3>
          <p className="text-gray-500 mb-6">
            Try adjusting your search or filter to find what you&apos;re looking for.
          </p>
          <Link
            href="/list"
            className="px-6 py-3 bg-accent text-white rounded-full hover:bg-primary transition-colors"
          >
            View All Products
          </Link>
        </div>
      )}

      {res.items.length > 0 && (
        <div className="mt-12">
          <Pagination
            currentPage={res.currentPage || 0}
            hasPrev={res.hasPrev()}
            hasNext={res.hasNext()}
          />
        </div>
      )}
    </div>
  );
};

export default ProductList;
