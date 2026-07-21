import { wixClientServer } from "@/lib/wixClientServer";
import GiftPackagingForm, { GiftableProduct } from "@/components/GiftPackagingForm";

export const metadata = {
  title: "Customize Your Gift Packaging | Viora Jewels",
  description:
    "Premium wrapping, ribbon and a personalised note — added to any Viora piece for ₹79.",
};

// Re-render hourly. The product list is prerendered, so without this a build
// that caught Wix mid-hiccup would serve an empty picker until the next deploy.
export const revalidate = 3600;

const GiftPackagingPage = async () => {
  // A flaky Wix response must not fail the build. Every other build-time Wix
  // caller (sitemap.ts, feed.xml, [slug] metadata) already catches for this
  // reason — this page was the one that didn't, and one bad response here took
  // the whole deployment down. Degrade to an empty picker instead; the form
  // renders fine with no products and `revalidate` fills it in on the next pass.
  let giftableProducts: GiftableProduct[] = [];

  try {
    const wixClient = await wixClientServer();

    const res = await wixClient.products
      .queryProducts()
      .hasSome("productType", ["physical", "digital"])
      .limit(24)
      .find();

    giftableProducts = res.items.map((p) => ({
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
  } catch (err) {
    console.error("[gift-packaging] product fetch failed, rendering empty picker:", err);
  }

  return <GiftPackagingForm products={giftableProducts} />;
};

export default GiftPackagingPage;
