import React from "react";

/**
 * Reusable Product structured-data (JSON-LD) component.
 *
 * Renders a schema.org/Product graph (plus an inline BreadcrumbList when
 * breadcrumb data is supplied) inside <script type="application/ld+json">
 * tags so Google and AI search engines (ChatGPT Search, Perplexity, Gemini)
 * can surface and cite specific products with price, availability, shipping
 * and return policy.
 *
 * Brand-wide constants (shipping + return policy) are baked in because they
 * apply identically to every product. Per-product variables stay as props.
 *
 * Reference: https://developers.google.com/search/docs/appearance/structured-data/product
 */

export interface BreadcrumbItem {
  name: string;
  url: string;
}

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
  /** Brand name. Defaults to "Viora Jewel" (singular — matches Organization entity). */
  brand?: string;
  /** ISO date (YYYY-MM-DD) until which the price is valid. */
  priceValidUntil?: string;
  /** Optional product category, e.g. "Necklace Set". */
  category?: string;
  /** Optional aggregate rating. Omitted entirely when there are no reviews. */
  aggregateRating?: {
    ratingValue: number;
    reviewCount: number;
  };
  /** Optional breadcrumbs. When provided, emits a BreadcrumbList graph. */
  breadcrumbs?: BreadcrumbItem[];
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

// Brand-wide shipping policy. Free, pan-India, 1–2 day processing + 5–7 day
// transit (mirrors /shipping-policy). Applied to every product offer.
const VIORA_SHIPPING_DETAILS = {
  "@type": "OfferShippingDetails",
  shippingRate: {
    "@type": "MonetaryAmount",
    value: "0",
    currency: "INR",
  },
  shippingDestination: {
    "@type": "DefinedRegion",
    addressCountry: "IN",
  },
  deliveryTime: {
    "@type": "ShippingDeliveryTime",
    handlingTime: {
      "@type": "QuantitativeValue",
      minValue: 1,
      maxValue: 2,
      unitCode: "DAY",
    },
    transitTime: {
      "@type": "QuantitativeValue",
      minValue: 5,
      maxValue: 7,
      unitCode: "DAY",
    },
  },
};

// Brand-wide return policy. 48-hour exchange window for damaged/incorrect
// items; we issue exchanges (or 12-month store credit), not refunds — modelled
// as ExchangeRefund. Mirrors /exchange-policy.
const VIORA_RETURN_POLICY = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: "IN",
  returnPolicyCountry: "IN",
  returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
  merchantReturnDays: 2,
  returnMethod: "https://schema.org/ReturnByMail",
  returnFees: "https://schema.org/FreeReturn",
  refundType: "https://schema.org/ExchangeRefund",
};

export default function ProductJsonLd({
  name,
  description,
  images,
  price,
  currency,
  availability,
  url,
  sku,
  brand = "Viora Jewel",
  priceValidUntil,
  category,
  aggregateRating,
  breadcrumbs,
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
    shippingDetails: VIORA_SHIPPING_DETAILS,
    hasMerchantReturnPolicy: VIORA_RETURN_POLICY,
  };
  if (priceValidUntil) offer.priceValidUntil = priceValidUntil;

  const productJsonLd: Record<string, unknown> = {
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

  if (imageList.length > 0) productJsonLd.image = imageList;
  if (description) productJsonLd.description = toPlainText(description);
  if (sku) {
    productJsonLd.sku = sku;
    productJsonLd.mpn = sku;
  }
  if (category) productJsonLd.category = category;

  // Only emit aggregateRating when there is at least one review with a valid
  // value — Google flags ratings of 0 or empty review counts as invalid.
  if (
    aggregateRating &&
    aggregateRating.reviewCount > 0 &&
    aggregateRating.ratingValue > 0
  ) {
    productJsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(aggregateRating.ratingValue.toFixed(1)),
      reviewCount: aggregateRating.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  const breadcrumbJsonLd =
    breadcrumbs && breadcrumbs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: breadcrumbs.map((b, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: b.name,
            item: b.url,
          })),
        }
      : null;

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeJsonLd(productJsonLd) }}
      />
      {breadcrumbJsonLd && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
        />
      )}
    </>
  );
}
