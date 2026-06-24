// Shared margin math used by both the server price resolver and the admin
// preview, so the displayed numbers always match what the catalog charges.
//
// All markups are basis points where 10000 = no change (×1.0), 11500 = +15%.

export type PricingTier = "homeowner" | "contractor" | "wholesale";

export interface TierMarkupBps {
  homeownerMarkupBps: number;
  contractorMarkupBps: number;
  wholesaleMarkupBps: number;
}

export const NEUTRAL_BPS = 10000;

/** Clamp a basis-points value to a sane range (0%..+1000%). */
export function clampBps(bps: number): number {
  if (!Number.isFinite(bps)) return NEUTRAL_BPS;
  return Math.min(110000, Math.max(0, Math.round(bps)));
}

/** Convert basis points to a human percent delta string, e.g. 11500 -> "+15%". */
export function bpsToPercentLabel(bps: number): string {
  const pct = (bps - NEUTRAL_BPS) / 100;
  const rounded = Math.round(pct * 100) / 100;
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

/** Pick the markup bps for a given tier from a settings object. */
export function markupBpsForTier(s: TierMarkupBps, tier: PricingTier): number {
  switch (tier) {
    case "homeowner":
      return s.homeownerMarkupBps;
    case "contractor":
      return s.contractorMarkupBps;
    case "wholesale":
      return s.wholesaleMarkupBps;
    default:
      return NEUTRAL_BPS;
  }
}

/**
 * Apply a tier markup to a base price (number or decimal string). Returns a
 * 2-dp number, or null when the input price is null/NaN.
 */
export function applyTierMarkup(
  basePrice: string | number | null | undefined,
  s: TierMarkupBps,
  tier: PricingTier,
): number | null {
  if (basePrice === null || basePrice === undefined) return null;
  const n = Number(basePrice);
  if (Number.isNaN(n)) return null;
  const bps = clampBps(markupBpsForTier(s, tier));
  return Math.round(n * (bps / NEUTRAL_BPS) * 100) / 100;
}
