import { wixClientServer } from "@/lib/wixClientServer";
import { baseNameOf } from "@/lib/catalogue";
import { toHttpsImage } from "@/lib/homeData";

// Short real review quotes for the top of the product page. The catalogue has
// only a handful of reviews, so this product's own come first, then 4★+ reviews
// of other pieces — labelled with the piece they're about, never passed off as
// reviews of this one.

export type ReviewSnippet = {
  id: string;
  author: string;
  rating: number;
  body: string;
  image?: string;
  /** Set when the review is of another colour or another design, e.g. "Royal Heartfall in Green". */
  otherProduct?: { name: string; slug: string };
  /** 0 = this product, 1 = same design in another colour, 2 = another design. */
  closeness: 0 | 1 | 2;
};

const MAX_SNIPPETS = 5;
const MIN_BODY_LENGTH = 12;

export async function loadReviewSnippets(productId: string, baseName: string): Promise<ReviewSnippet[]> {
  try {
    const wixClient = await wixClientServer();
    const res: any = await wixClient.reviews
      .queryReviews()
      .eq("namespace", "stores")
      .descending("_createdDate")
      .limit(100)
      .find();

    const usable = ((res.items || []) as any[]).filter(
      (r) =>
        (Number(r.content?.rating) || 0) >= 4 &&
        String(r.content?.body || "").trim().length >= MIN_BODY_LENGTH
    );
    if (usable.length === 0) return [];

    const otherIds = Array.from(
      new Set(usable.map((r) => String(r.entityId)).filter((id) => id && id !== productId))
    );
    const others = otherIds.length
      ? (await wixClient.products.queryProducts().in("_id", otherIds).limit(100).find()).items
      : [];
    const byId = new Map(others.map((p) => [p._id!, p]));

    const snippets: ReviewSnippet[] = [];
    for (const r of usable) {
      const own = r.entityId === productId;
      const product = own ? undefined : byId.get(r.entityId);
      if (!own && (!product || product.visible === false || !product.slug)) continue;
      const otherBase = product ? baseNameOf(product) : "";
      const sameDesign = !own && otherBase.toLowerCase() === baseName.toLowerCase();
      const otherColour = product?.name?.split(" - ")[1]?.trim();
      snippets.push({
        id: r._id,
        author: r.author?.authorName || "Viora customer",
        rating: Number(r.content.rating),
        body: String(r.content.body).trim(),
        image: toHttpsImage(Array.isArray(r.content?.media) ? r.content.media[0]?.image : undefined),
        otherProduct: own
          ? undefined
          : {
              name: sameDesign && otherColour ? `this piece in ${otherColour}` : otherBase,
              slug: product!.slug!,
            },
        closeness: own ? 0 : sameDesign ? 1 : 2,
      });
    }

    // This product, then its other colours, then other designs; photo reviews first within each.
    return snippets
      .sort((a, b) => a.closeness - b.closeness || Number(!!b.image) - Number(!!a.image))
      .slice(0, MAX_SNIPPETS);
  } catch (err) {
    console.error("[review snippets] failed:", err);
    return [];
  }
}
