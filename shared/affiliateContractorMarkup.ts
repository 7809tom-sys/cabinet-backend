import {
  clampBps,
  contractorPriceOverAffiliateCost,
  NEUTRAL_BPS,
  type AffiliateContractorCostContext,
  type CostBaseRow,
  type TierMarkupBps,
} from "./margins";

/** Lowest allowed affiliate markup over the affiliate's cost. 0% sells at that cost. */
export const AFFILIATE_CONTRACTOR_MARKUP_MIN_PERCENT = 0;
/** Highest allowed affiliate markup over the affiliate's cost. */
export const AFFILIATE_CONTRACTOR_MARKUP_MAX_PERCENT = 200;

/**
 * Stored markupBps is the markup itself: 100 basis points = 1 percent over the affiliate's cost.
 * 29.50% is 2950. It is not the site-wide contractor multiplier, where 10000 = ×1.
 */
export function markupPercentToBps(percent: number): number {
  return Math.round(percent * 100);
}

export function markupBpsToPercent(markupBps: number): number {
  return Math.round(markupBps) / 100;
}

export function isAffiliateContractorMarkupPercent(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (value < AFFILIATE_CONTRACTOR_MARKUP_MIN_PERCENT || value > AFFILIATE_CONTRACTOR_MARKUP_MAX_PERCENT) return false;
  const bps = markupPercentToBps(value);
  return Math.abs(value * 100 - bps) < 1e-6;
}

/**
 * Site contractorMarkupBps is a multiplier on Cabinet Dealz cost (12900 = ×1.29).
 * Express that same multiplier as percent over that cost, rounded to 2 decimals.
 * It is the fallback when an affiliate has not saved a contractor markup.
 */
export function siteContractorMarkupPercent(contractorMarkupBps: number): number {
  const multiplier = Number(contractorMarkupBps);
  if (!Number.isFinite(multiplier)) return 0;
  return Math.round((multiplier / NEUTRAL_BPS - 1) * 100 * 100) / 100;
}

/**
 * Multiplier basis points for a saved markup: 10000 + markup bps, with the
 * same 0%..+1000% cap as other tier markups. Live prices apply this to the
 * submitting store's affiliate cost, not to Cabinet Dealz cost.
 */
export function contractorMultiplierBpsFromMarkup(markupBps: number): number {
  return clampBps(NEUTRAL_BPS + markupBps);
}

/**
 * Rewrites only the site contractor multiplier. It does not change the cost
 * base. Viewer pricing does not use this for a store that saved a markup;
 * that path attaches affiliateContractorCost and prices over the affiliate's cost.
 * A null markup leaves the site contractor multiplier unchanged.
 */
export function pricingSettingsWithAffiliateContractorMarkup<T extends TierMarkupBps>(
  settings: T,
  markupBps: number | null,
): T {
  if (markupBps == null) return settings;
  return { ...settings, contractorMarkupBps: contractorMultiplierBpsFromMarkup(markupBps) };
}

/**
 * Contractor sell price over the affiliate's cost.
 * With no tier and a zero platform affiliate markup, that cost equals Cabinet Dealz cost.
 */
export function affiliateContractorSellPrice(
  row: CostBaseRow,
  _settings: TierMarkupBps,
  markupPercent: number,
  cost?: Pick<AffiliateContractorCostContext, "tier" | "platformAffiliateMarkupBps">,
): number | null {
  return contractorPriceOverAffiliateCost(row, {
    markupBps: markupPercentToBps(markupPercent),
    tier: cost?.tier ?? null,
    platformAffiliateMarkupBps: cost?.platformAffiliateMarkupBps ?? 0,
  });
}
