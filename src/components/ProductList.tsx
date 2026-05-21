import { wixClientServer } from "@/lib/wixClientServer";
import { ALL_PRODUCTS_FEATURED_ORDER, WIX_COLLECTION_IDS } from "@/lib/categories";
import { products } from "@wix/stores";
import Link from "next/link";
import ProductCard from "./ProductCard";
import Pagination from "./Pagination";
const PRODUCT_PER_PAGE = 8;
const PRODUCT_FETCH_LIMIT = 100;

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

  // Note: name search is applied in-memory (case-insensitive substring) below,
  // NOT via .startsWith here. Wix's startsWith is case-sensitive and prefix-only,
  // so searching "blue" would never match "Eternal Shine ... - Blue".
  let productQuery = wixClient.products
    .queryProducts()
    .hasSome(
      "productType",
      searchParams?.type ? [searchParams.type] : ["physical", "digital"]
    )
    .gt("priceData.price", searchParams?.min || 0)
    .lt("priceData.price", searchParams?.max || 999999);

  if (categoryId) {
    productQuery = productQuery.hasSome("collectionIds", [categoryId]);
  }

  if (searchParams?.sort) {
    const [sortType, sortBy] = searchParams.sort.split(" ");
    if (sortType === "asc") productQuery = productQuery.ascending(sortBy);
    if (sortType === "desc") productQuery = productQuery.descending(sortBy);
  }

  const pageSize = limit || PRODUCT_PER_PAGE;
  const requestedPage = searchParams?.page ? parseInt(searchParams.page) : 0;
  const currentPage = Number.isFinite(requestedPage) ? Math.max(requestedPage, 0) : 0;

  const res = await productQuery.limit(PRODUCT_FETCH_LIMIT).find();

  // Case-insensitive substring search across the product name. Matches any
  // word (e.g. "blue" hits "Eternal Shine Jewelry Set - Blue").
  const searchTerm = (searchParams?.q || "").trim().toLowerCase();
  const searchedItems = searchTerm
    ? res.items.filter((item) =>
        (item.name || "").toLowerCase().includes(searchTerm)
      )
    : res.items;

  // Override which color variant is shown on the listing page for specific
  // products. Key = lowercase base name, value = lowercase color suffix.
  const preferredColorOverrides: Record<string, string> = {
    "eternal shine jewelry set": "blue",
    "emerald bloom ensemble jewelry set": "pink",
  };

  // First pass: group all items by base name
  const groupedByBase = new Map<string, products.Product[]>();
  for (const item of searchedItems) {
    const baseName = (item.name || "").split(" - ")[0].trim().toLowerCase();
    if (!baseName) {
      // Products without a base name pattern get added directly
      groupedByBase.set(item._id || item.name || "", [item]);
      continue;
    }
    const existing = groupedByBase.get(baseName) || [];
    existing.push(item);
    groupedByBase.set(baseName, existing);
  }

  // Second pass: pick preferred variant or fallback to first
  const allDedupedItems: products.Product[] = [];
  for (const [baseName, variants] of Array.from(groupedByBase.entries())) {
    const preferred = preferredColorOverrides[baseName];
    if (preferred && variants.length > 1) {
      const match = variants.find((v) => {
        const colorPart = (v.name || "").split(" - ").slice(1).join(" - ").trim().toLowerCase();
        return colorPart === preferred;
      });
      allDedupedItems.push(match || variants[0]);
    } else {
      allDedupedItems.push(variants[0]);
    }
  }

  if (categoryId === WIX_COLLECTION_IDS.allProducts && !searchParams?.sort) {
    const priority = new Map<string, number>(
      ALL_PRODUCTS_FEATURED_ORDER.map((name, index) => [name, index])
    );

    allDedupedItems.sort((a, b) => {
      const aName = (a.name || "").split(" - ")[0].trim().toLowerCase();
      const bName = (b.name || "").split(" - ")[0].trim().toLowerCase();
      const aRank = priority.get(aName) ?? Number.MAX_SAFE_INTEGER;
      const bRank = priority.get(bName) ?? Number.MAX_SAFE_INTEGER;

      return aRank - bRank;
    });
  }

  const pageStart = limit ? 0 : currentPage * pageSize;
  const pageEnd = pageStart + pageSize;
  const dedupedItems = allDedupedItems.slice(pageStart, pageEnd);

  const hasNextPage = !limit && allDedupedItems.length > pageEnd;
  const hasPrevPage = !limit && currentPage > 0;

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

      {(hasPrevPage || hasNextPage) && (
        <div className="mt-12">
          <Pagination
            currentPage={currentPage}
            hasPrev={hasPrevPage}
            hasNext={hasNextPage}
            searchParams={searchParams}
          />
        </div>
      )}
    </div>
  );
};

export default ProductList;
