/**
 * Pure builders for schema.org structured data (JSON-LD).
 *
 * These produce plain objects that `useSeo({ jsonLd })` injects as
 * <script type="application/ld+json"> tags so Cabinet and Package pages are
 * eligible for Google rich results (Product / Offer snippets).
 *
 * Design notes:
 * - Builders are framework-free and deterministic so they can be unit-tested.
 * - Undefined/empty fields are omitted entirely (Google prefers absent over
 *   empty/null values).
 * - Cabinet pricing is tier-gated and partly member-only, so the cabinet
 *   Product schema intentionally OMITS an Offer (we never expose trade prices
 *   in markup). Packages have a public suggested retail price, so they DO
 *   include an Offer.
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

export interface OfferInput {
  /** Numeric price; rendered with 2 decimals as a string per schema.org. */
  price: number;
  priceCurrency?: string;
  /** schema.org availability URL suffix, e.g. "InStock". */
  availability?: string;
  url?: string;
}

export interface PackageJsonLdInput extends ProductJsonLdInput {
  offer: OfferInput;
}

/**
 * Product schema WITH an Offer — used for kitchen packages, which have a
 * public suggested retail price.
 */
export function buildPackageJsonLd(
  input: PackageJsonLdInput,
): Record<string, unknown> {
  const { offer } = input;
  const offerObj = compact({
    "@type": "Offer",
    price: Number.isFinite(offer.price) ? offer.price.toFixed(2) : undefined,
    priceCurrency: offer.priceCurrency ?? "USD",
    availability: `https://schema.org/${offer.availability ?? "InStock"}`,
    url: offer.url ?? input.url,
  });

  return compact({
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    sku: input.sku,
    image: input.image,
    url: input.url,
    category: input.category ?? "Kitchen Cabinet Package",
    brand: BRAND,
    offers: offerObj,
  });
}
