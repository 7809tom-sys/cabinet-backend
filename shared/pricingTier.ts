// ─────────────────────────────────────────────────────────────────────────────
// Pricing-tier resolution
// A logged-in user is assigned ONE pricing tier (homeowner | contractor |
// wholesale) by the owner after they're seen on the site. That tier decides
// which of the three SKU price columns the user actually sees and checks out at.
//
// Anonymous / not-yet-approved visitors default to the homeowner tier (the
// highest of the three — i.e. retail), so trade pricing is never exposed until
// the owner explicitly approves the account.
// ─────────────────────────────────────────────────────────────────────────────

export type PricingTier = "homeowner" | "contractor" | "wholesale";

export const PRICING_TIERS: readonly PricingTier[] = [
  "homeowner",
  "contractor",
  "wholesale",
] as const;

export const DEFAULT_PRICING_TIER: PricingTier = "homeowner";

/** Human-readable label for a tier. */
export function tierLabel(tier: PricingTier): string {
  switch (tier) {
    case "wholesale":
      return "Wholesale";
    case "contractor":
      return "Contractor";
    case "homeowner":
    default:
      return "Homeowner";
  }
}

/** Normalize any input into a valid tier, falling back to the default. */
export function normalizeTier(value: unknown): PricingTier {
  if (typeof value === "string") {
    const v = value.toLowerCase();
    if (v === "homeowner" || v === "contractor" || v === "wholesale") return v;
  }
  return DEFAULT_PRICING_TIER;
}

export interface TierPrices {
  wholesalePrice?: number | string | null;
  contractorPrice?: number | string | null;
  homeownerPrice?: number | string | null;
  // Fallbacks used when a tier-specific column is missing.
  adjustedListPrice?: number | string | null;
  listPrice?: number | string | null;
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve the single effective price for a user's tier from a SKU's price set.
 *
 * Resolution rules:
 *  - wholesale  → wholesalePrice, else contractorPrice, else homeowner/adjusted/list
 *  - contractor → contractorPrice, else wholesalePrice, else homeowner/adjusted/list
 *  - homeowner  → homeownerPrice, else adjustedListPrice, else listPrice, else contractor
 *
 * Returns null when no usable price exists.
 */
export function resolveTierPrice(
  tier: PricingTier,
  prices: TierPrices,
): number | null {
  const wholesale = num(prices.wholesalePrice);
  const contractor = num(prices.contractorPrice);
  const homeowner = num(prices.homeownerPrice);
  const adjusted = num(prices.adjustedListPrice);
  const list = num(prices.listPrice);

  switch (tier) {
    case "wholesale":
      return wholesale ?? contractor ?? homeowner ?? adjusted ?? list;
    case "contractor":
      return contractor ?? wholesale ?? homeowner ?? adjusted ?? list;
    case "homeowner":
    default:
      return homeowner ?? adjusted ?? list ?? contractor ?? wholesale;
  }
}

/**
 * Resolve the storefront pricing tier for the current viewer. Anonymous
 * visitors (and users without an explicit tier) see the retail HOMEOWNER price;
 * a logged-in pro sees the tier the owner assigned to their account.
 */
export function resolveStorefrontTier(
  user: { pricingTier?: unknown } | null | undefined,
): PricingTier {
  if (!user) return DEFAULT_PRICING_TIER;
  return normalizeTier(user.pricingTier);
}

/**
 * The struck-through "Compare at" reference price for the homeowner sale
 * display: the prior list price (adjustedListPrice/listPrice), shown only when
 * it is strictly higher than the live homeowner price. Null when there is no
 * genuine markdown to show, or for non-homeowner tiers.
 */
export function compareAtPrice(
  tier: PricingTier,
  prices: TierPrices,
): number | null {
  if (tier !== "homeowner") return null;
  const live = resolveTierPrice("homeowner", prices);
  const compare = num(prices.adjustedListPrice) ?? num(prices.listPrice);
  if (live === null || compare === null) return null;
  return compare > live ? compare : null;
}
