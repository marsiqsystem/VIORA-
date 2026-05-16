// pages/all-products.tsx
import { wixClientServer } from "@/lib/wixClientServer";
import ProductList from "@/components/ProductList";

const ProductsPage = async ({ searchParams }: { searchParams: any }) => {
  const wixClient = await wixClientServer();

  try {
    // Fetch all collections
    const collections = await wixClient.collections.queryCollections().find();

    // Filter to find the collection with the slug "all-products"
    const allProductsCategory = collections.items.find(
      (item) => item.slug === "all-products"
    );

    // Get the category ID if it exists
    const categoryId = allProductsCategory ? allProductsCategory._id : null;

    if (!categoryId) {
      return <p>All products category not found.</p>;
    }

    return (
      <div className="px-2 md:px-2 lg:px-2 xl:px-6 2xl:px-12 w-full flex flex-col items-center overflow-hidden">
        <div
          className="w-full h-screen xl:flex-row bg-cover bg-center fade-in"
          style={{
            backgroundImage: "url('/productsdesk.jpg')",
          }}
        >
          <div className="flex flex-col items-center justify-center text-center gap-8 p-6 w-full h-full bg-black bg-opacity-40">
            <h1 className="font-playfair text-5xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-7xl 2xl:text-8xl text-white font-light">
              All Products
            </h1>
          </div>
        </div>
        <div className="w-full">
          {/* Render ProductList with the "all-products" category ID */}
          <ProductList categoryId={categoryId} searchParams={searchParams} />
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error fetching the category:", error);
    return <p>Error loading the All Products category.</p>;
  }
};

export default ProductsPage;
