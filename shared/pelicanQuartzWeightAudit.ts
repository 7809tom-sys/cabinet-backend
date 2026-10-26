/**
 * Read-only comparison of saved Pelican shipping-profile weights against the
 * public Shopify product feed at https://buildpelican.com/products.json.
 *
 * The quartz comparison rule (`quartz-slab-v1`) uses 600 lb. Pelican's catalog
 * lists 800 lb for 3cm slabs and 1,080 lb for Super Jumbo slabs, so an LTL
 * quote built from the comparison rule can be low. This helper never writes.
 */

import { QUARTZ_CATALOG_WEIGHTS_LBS, QUARTZ_ESTIMATE_WEIGHT_LBS } from "./shippingQuote";

export type PelicanWeightProfile = {
  pelicanCode: string;
  name: string;
  category: string | null;
  weightLbs: number | null;
  evidenceType: string | null;
};

export type ShopifyCatalogWeight = {
  sku: string;
  title: string;
  weightLbs: number;
};

export type PelicanWeightMismatch = {
  pelicanCode: string;
  name: string;
  profileWeightLbs: number | null;
  catalogWeightLbs: number;
  catalogTitle: string;
  differenceLbs: number | null;
};

export const PELICAN_SHOPIFY_PRODUCTS_URL = "https://buildpelican.com/products.json";

export const QUARTZ_WEIGHT_DATA_ISSUE =
  `The quartz comparison estimate assumes ${QUARTZ_ESTIMATE_WEIGHT_LBS} lb per slab. Pelican's Shopify catalog lists ${QUARTZ_CATALOG_WEIGHTS_LBS.map((row) => `${row.weightLbs} lb (${row.label})`).join(" and ")}, so quartz LTL quotes from that estimate may be low.`;

export function shopifyGramsToPounds(grams: number): number | null {
  if (!Number.isFinite(grams) || grams <= 0) return null;
  return Math.round((grams / 453.59237) * 100) / 100;
}

export function parseShopifyProductWeights(payload: unknown): ShopifyCatalogWeight[] {
  const products = (payload as { products?: unknown } | null)?.products;
  if (!Array.isArray(products)) return [];
  const weights: ShopifyCatalogWeight[] = [];
  for (const product of products) {
    if (!product || typeof product !== "object") continue;
    const title = typeof (product as { title?: unknown }).title === "string" ? (product as { title: string }).title : "";
    const variants = (product as { variants?: unknown }).variants;
    if (!Array.isArray(variants)) continue;
    for (const variant of variants) {
      if (!variant || typeof variant !== "object") continue;
      const row = variant as { sku?: unknown; title?: unknown; grams?: unknown; weight?: unknown; weight_unit?: unknown };
      const sku = typeof row.sku === "string" ? row.sku.trim() : "";
      if (!sku) continue;
      let weightLbs: number | null = null;
      if (typeof row.grams === "number") weightLbs = shopifyGramsToPounds(row.grams);
      else if (typeof row.weight === "number") {
        const unit = typeof row.weight_unit === "string" ? row.weight_unit.toLowerCase() : "lb";
        if (unit === "g" || unit === "grams") weightLbs = shopifyGramsToPounds(row.weight);
        else if (unit === "kg") weightLbs = Math.round(row.weight * 2.20462262 * 100) / 100;
        else if (unit === "oz") weightLbs = Math.round((row.weight / 16) * 100) / 100;
        else weightLbs = row.weight;
      }
      if (weightLbs == null || weightLbs <= 0) continue;
      const variantTitle = typeof row.title === "string" && row.title !== "Default Title" ? `${title} ${row.title}` : title;
      weights.push({ sku, title: variantTitle || sku, weightLbs });
    }
  }
  return weights;
}

export function comparePelicanProfileWeights(
  profiles: readonly PelicanWeightProfile[],
  catalog: readonly ShopifyCatalogWeight[],
  toleranceLbs = 1,
): PelicanWeightMismatch[] {
  const bySku = new Map(catalog.map((row) => [row.sku.trim().toUpperCase(), row]));
  const mismatches: PelicanWeightMismatch[] = [];
  for (const profile of profiles) {
    const match = bySku.get(profile.pelicanCode.trim().toUpperCase());
    if (!match) continue;
    const difference = profile.weightLbs == null ? null : Math.round((profile.weightLbs - match.weightLbs) * 100) / 100;
    if (difference != null && Math.abs(difference) <= toleranceLbs) continue;
    mismatches.push({
      pelicanCode: profile.pelicanCode,
      name: profile.name,
      profileWeightLbs: profile.weightLbs,
      catalogWeightLbs: match.weightLbs,
      catalogTitle: match.title,
      differenceLbs: difference,
    });
  }
  return mismatches.sort((left, right) => left.pelicanCode.localeCompare(right.pelicanCode));
}
