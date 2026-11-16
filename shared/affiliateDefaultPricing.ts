// ─────────────────────────────────────────────────────────────────────────────
// Site-wide DEFAULT affiliate selling price (owner rule, Nov 16 2026).
//
//   customer price = business cost × (1 + fee) × (1 + markup)
//                  = distributor_skus.yourCost × 1.10 × 1.40
//                  = business cost × 1.54
//
// "Business cost" is distributor_skus.yourCost: what Cabinetdealz pays the
// supplier/distributor for that exact SKU (list × the line's landed-cost
// multiplier). The fee step produces the affiliate's cost; the markup step
// produces the customer price. Each step is rounded to whole cents
// (half-up, Math.round) before the next step, so $100.00 → $110.00 → $154.00.
//
// Per-affiliate overrides win over this default:
//   • an active pricing tier (affiliates.pricingTierId) replaces the fee step;
//   • the affiliate's own markup (style > category > affiliates.defaultMarkupBps)
//     replaces the markup step.
//
// FLOOR: no affiliate price, default or override, may be below business
// cost × 1.15 (AFFILIATE_FLOOR_BPS). This is the owner's minimum margin and
// applies to every payment method. Overrides may go below the 1.54 default
// but are clamped up to the floor.
//
// Affiliate prices always come from business cost, never from list.
//
// The fee and the markup are separate on purpose. To switch to a flat 40%
// over business cost, set AFFILIATE_DEFAULT_FEE_BPS to 0.
// All values are basis points over the previous step (1000 = +10%).
// ─────────────────────────────────────────────────────────────────────────────

/** Default fee step over business cost: +10%. */
export const AFFILIATE_DEFAULT_FEE_BPS = 1000;
/** Default affiliate markup over the affiliate's cost: +40%. */
export const AFFILIATE_DEFAULT_MARKUP_BPS = 4000;

/** Minimum affiliate customer price over business cost: +15%, every payment method. */
export const AFFILIATE_FLOOR_BPS = 1500;

function bpsOf(cents: number, bps: number): number {
  return Math.round((cents * bps) / 10000);
}

/** Business cost + the default fee, in whole cents. Null when there is no positive cost. */
export function defaultAffiliateCostCents(businessCostCents: number | null | undefined): number | null {
  if (businessCostCents == null || !Number.isFinite(businessCostCents)) return null;
  const cost = Math.round(businessCostCents);
  if (cost <= 0) return null;
  return cost + bpsOf(cost, AFFILIATE_DEFAULT_FEE_BPS);
}

/** Affiliate cost + a markup (defaults to AFFILIATE_DEFAULT_MARKUP_BPS), in whole cents. */
export function applyAffiliateMarkupCents(
  affiliateCostCents: number,
  markupBps: number = AFFILIATE_DEFAULT_MARKUP_BPS,
): number {
  const cost = Math.max(0, Math.round(affiliateCostCents));
  const bps = Number.isFinite(markupBps) && markupBps >= 0 ? Math.round(markupBps) : AFFILIATE_DEFAULT_MARKUP_BPS;
  return cost + bpsOf(cost, bps);
}

/** The full default: business cost × 1.10 × 1.40, rounded per step. */
export function defaultAffiliateSaleCents(businessCostCents: number | null | undefined): number | null {
  const affiliateCost = defaultAffiliateCostCents(businessCostCents);
  return affiliateCost == null ? null : applyAffiliateMarkupCents(affiliateCost, AFFILIATE_DEFAULT_MARKUP_BPS);
}

/** Business cost × 1.15 in whole cents. Null when there is no positive cost. */
export function affiliateFloorCents(businessCostCents: number | null | undefined): number | null {
  if (businessCostCents == null || !Number.isFinite(businessCostCents)) return null;
  const cost = Math.round(businessCostCents);
  if (cost <= 0) return null;
  return cost + bpsOf(cost, AFFILIATE_FLOOR_BPS);
}

/** Raise a price to the floor when it is below business cost × 1.15. Unknown cost leaves it unchanged. */
export function clampToAffiliateFloorCents(priceCents: number, businessCostCents: number | null | undefined): number {
  const floor = affiliateFloorCents(businessCostCents);
  const price = Math.round(priceCents);
  return floor != null && price < floor ? floor : price;
}

/**
 * True when an affiliate cost multiplier (bps of business cost, 10000 = ×1.00)
 * plus a markup over it reaches the floor. Used to reject override saves.
 */
export function affiliateOverrideMeetsFloor(costMultiplierBps: number, markupBps: number): boolean {
  if (!Number.isFinite(costMultiplierBps) || !Number.isFinite(markupBps)) return false;
  // Compare in integer space: mult × (10000 + markup) ≥ (10000 + floor) × 10000.
  return Math.round(costMultiplierBps) * (10000 + Math.round(markupBps)) >= (10000 + AFFILIATE_FLOOR_BPS) * 10000;
}

/** Smallest whole-bps markup over an affiliate cost multiplier that reaches the floor. */
export function minimumMarkupBpsForFloor(costMultiplierBps: number): number {
  const mult = Math.max(1, Math.round(costMultiplierBps));
  const needed = Math.ceil(((10000 + AFFILIATE_FLOOR_BPS) * 10000) / mult) - 10000;
  return Math.max(0, needed);
}
