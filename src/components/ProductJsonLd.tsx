import React from "react";

/**
 * Reusable Product structured-data (JSON-LD) component.
 *
 * Renders a schema.org/Product graph inside a <script type="application/ld+json">
 * tag so Google can surface Rich Results (price, availability, rating) for a
 * product page. Designed to be fed data straight from the Wix Headless API.
 *
 * Google Product snippet requirements covered here:
 *  - `name` (required)
 *  - `image` (recommended — array of absolute URLs)
 *  - `offers` with `price`, `priceCurrency`, `availability` and `url`
 *  - optional `aggregateRating` / `sku` / `brand` for richer results
 *
 * Reference: https://developers.google.com/search/docs/appearance/structured-data/product
 */

export interface ProductJsonLdProps {
  /** Product display name. */
  name: string;
  /** Product description. HTML is stripped automatically to plain text. */
  description?: string;
  /** Absolute image URLs. The first is treated as the primary image. */
  images?: (string | undefined | null)[];
  /** Numeric price (no currency symbol). Discounted price if one applies. */
  price: number | string;
  /** ISO 4217 currency code, e.g. "INR". */
  currency: string;
  /**
   * Stock state. Accepts a boolean (true = in stock) or an explicit
   * schema.org token for finer control.
   */
  availability: boolean | "InStock" | "OutOfStock" | "PreOrder" | "BackOrder";
  /** Canonical, absolute URL of the product page. */
  url: string;
  /** Optional SKU / stock keeping unit. */
  sku?: string;
  /** Brand name. Defaults to "Viora Jewels". */
  brand?: string;
  /** ISO date (YYYY-MM-DD) until which the price is valid. Recommended by Google. */
  priceValidUntil?: string;
  /** Optional aggregate rating. Omitted entirely when there are no reviews. */
  aggregateRating?: {
    ratingValue: number;
    reviewCount: number;
  };
}

/** Strip HTML tags and collapse whitespace so descriptions are valid plain text. */
function toPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map the incoming availability prop to a full schema.org URL. */
function toSchemaAvailability(
  availability: ProductJsonLdProps["availability"]
): string {
  if (availability === true) return "https://schema.org/InStock";
  if (availability === false) return "https://schema.org/OutOfStock";
  return `https://schema.org/${availability}`;
}

/**
 * Escape the JSON so it can't break out of the <script> element.
 * Replacing `<`, `>` and `&` is the recommended XSS-safe approach for inline
 * JSON-LD (prevents `</script>` injection from product copy).
 */
function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export default function ProductJsonLd({
  name,
  description,
  images,
  price,
  currency,
  availability,
  url,
  sku,
  brand = "Viora Jewels",
  priceValidUntil,
  aggregateRating,
}: ProductJsonLdProps) {
  // Normalise the price to a plain numeric string (schema.org expects no symbol).
  const priceString =
    typeof price === "number" ? price.toFixed(2) : String(price);

  // Dedupe and drop empty image URLs.
  const imageList = Array.from(
    new Set((images || []).filter((src): src is string => Boolean(src)))
  );

  const offer: Record<string, unknown> = {
    "@type": "Offer",
    price: priceString,
    priceCurrency: currency,
    availability: toSchemaAvailability(availability),
    url,
    itemCondition: "https://schema.org/NewCondition",
  };
  if (priceValidUntil) offer.priceValidUntil = priceValidUntil;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    url,
    brand: {
      "@type": "Brand",
      name: brand,
    },
    offers: offer,
  };

  if (imageList.length > 0) jsonLd.image = imageList;
  if (description) jsonLd.description = toPlainText(description);
  if (sku) jsonLd.sku = sku;

  // Only emit aggregateRating when there is at least one review with a valid
  // value — Google flags ratings of 0 or empty review counts as invalid.
  if (
    aggregateRating &&
    aggregateRating.reviewCount > 0 &&
    aggregateRating.ratingValue > 0
  ) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(aggregateRating.ratingValue.toFixed(1)),
      reviewCount: aggregateRating.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
    />
  );
}
