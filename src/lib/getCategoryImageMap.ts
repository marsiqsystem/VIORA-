import { CATEGORY_LINKS } from "@/lib/categories";

type WixCollectionsClient = {
  collections: {
    getCollection: (id: string) => Promise<any>;
  };
};

const toThumbnailUrl = (url?: string) => {
  if (!url) return "";

  return url.replace(
    /\/v1\/[^/]+\/[^/]+\/file\.(jpg|jpeg|png|webp)/i,
    "/v1/fill/w_512,h_512,al_c,q_85/file.$1"
  );
};

export const getCategoryImageMap = async (
  wixClient: WixCollectionsClient
): Promise<Record<string, string>> => {
  const entries = await Promise.all(
    CATEGORY_LINKS.map(async (category) => {
      try {
        const collection = await wixClient.collections.getCollection(category.id);
        const imageUrl = collection?.media?.mainMedia?.image?.url;

        return [category.slug, toThumbnailUrl(imageUrl)] as const;
      } catch {
        return [category.slug, ""] as const;
      }
    })
  );

  return Object.fromEntries(entries);
};
