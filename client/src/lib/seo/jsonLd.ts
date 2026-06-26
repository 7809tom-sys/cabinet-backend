/**
 * Pure builders for schema.org structured data (JSON-LD).
 *
 * These produce plain objects that `useSeo({ jsonLd })` injects as
 * <script type="application/ld+json"> tags so Cabinet pages are
 * eligible for Google rich results (Product snippets).
 *
 * Design notes:
 * - Builders are framework-free and deterministic so they can be unit-tested.
 * - Undefined/empty fields are omitted entirely (Google prefers absent over
 *   empty/null values).
 * - Cabinet pricing is tier-gated and partly member-only, so the cabinet
 *   Product schema intentionally OMITS an Offer (we never expose trade prices
 *   in markup).
 */

const SITE_NAME = "Cabinet Dealz";
const BRAND = { "@type": "Brand", name: SITE_NAME } as const;

/** Drop keys whose value is undefined, null, or an empty string. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out as T;
}

export interface ProductJsonLdInput {
  name: string;
  description?: string;
  /** Stock keeping unit / master code, e.g. "B12". */
  sku?: string;
  /** Absolute image URL for the product. */
  image?: string;
  /** Canonical product URL. */
  url?: string;
  /** Top-level product category, e.g. "Base Cabinets". */
  category?: string;
}

/**
 * Product schema WITHOUT an offer — used for cabinets, whose price is
 * tier/member-gated and must not be published in markup.
 */
export function buildProductJsonLd(
  input: ProductJsonLdInput,
): Record<string, unknown> {
  return compact({
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    sku: input.sku,
    mpn: input.sku,
    image: input.image,
    url: input.url,
    category: input.category,
    brand: BRAND,
  });
}
