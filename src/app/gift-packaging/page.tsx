import { wixClientServer } from "@/lib/wixClientServer";
import GiftPackagingForm, { GiftableProduct } from "@/components/GiftPackagingForm";

export const metadata = {
  title: "Customize Your Gift Packaging | Viora Jewels",
  description:
    "Premium wrapping, ribbon and a personalised note — added to any Viora piece for ₹79.",
};

const GiftPackagingPage = async () => {
  const wixClient = await wixClientServer();

  const res = await wixClient.products
    .queryProducts()
    .hasSome("productType", ["physical", "digital"])
    .limit(24)
    .find();

  const giftableProducts: GiftableProduct[] = res.items.map((p) => ({
    id: p._id!,
    name: p.name || "Viora piece",
    slug: p.slug || "",
    image: p.media?.mainMedia?.image?.url || "/product.png",
    price: p.price?.discountedPrice ?? p.price?.price ?? 0,
    variantId:
      p.productType === "digital"
        ? (p.variants?.[0]?._id || "00000000-0000-0000-0000-000000000000")
        : "00000000-0000-0000-0000-000000000000",
  }));

  return <GiftPackagingForm products={giftableProducts} />;
};

export default GiftPackagingPage;
