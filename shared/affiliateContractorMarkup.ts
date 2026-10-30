import { clampBps, NEUTRAL_BPS, sellPriceForTier, type CostBaseRow, type TierMarkupBps } from "./margins";

/** Lowest allowed affiliate markup over cost. 0% sells at our cost. */
export const AFFILIATE_CONTRACTOR_MARKUP_MIN_PERCENT = 0;
/** Highest allowed affiliate markup over cost. */
export const AFFILIATE_CONTRACTOR_MARKUP_MAX_PERCENT = 200;

/**
 * Stored markupBps is the markup itself: 100 basis points = 1 percent over cost.
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
 * Site contractorMarkupBps is a multiplier on cost (12900 = ×1.29 = 29% over cost).
 * Express that same multiplier as percent over cost, rounded to 2 decimals.
 */
export function siteContractorMarkupPercent(contractorMarkupBps: number): number {
  const multiplier = Number(contractorMarkupBps);
  if (!Number.isFinite(multiplier)) return 0;
  return Math.round((multiplier / NEUTRAL_BPS - 1) * 100 * 100) / 100;
}

/** Multiplier basis points sellPriceForTier already applies: 10000 + markup bps. */
export function contractorMultiplierBpsFromMarkup(markupBps: number): number {
  return clampBps(NEUTRAL_BPS + markupBps);
}

export function pricingSettingsWithAffiliateContractorMarkup<T extends TierMarkupBps>(
  settings: T,
  markupBps: number | null,
): T {
  if (markupBps == null) return settings;
  return { ...settings, contractorMarkupBps: contractorMultiplierBpsFromMarkup(markupBps) };
}

/** Contractor-tier sell price from our cost and an affiliate percent-over-cost. */
export function affiliateContractorSellPrice(
  row: CostBaseRow,
  settings: TierMarkupBps,
  markupPercent: number,
): number | null {
  return sellPriceForTier(
    row,
    pricingSettingsWithAffiliateContractorMarkup(settings, markupPercentToBps(markupPercent)),
    "contractor",
  );
}
