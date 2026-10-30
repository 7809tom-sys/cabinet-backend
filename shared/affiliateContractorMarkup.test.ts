import { describe, expect, it } from "vitest";
import { sellPriceForTier, type TierMarkupBps } from "./margins";
import {
  AFFILIATE_CONTRACTOR_MARKUP_MAX_PERCENT,
  affiliateContractorSellPrice,
  isAffiliateContractorMarkupPercent,
  markupBpsToPercent,
  markupPercentToBps,
  pricingSettingsWithAffiliateContractorMarkup,
  siteContractorMarkupPercent,
} from "./affiliateContractorMarkup";

const SETTINGS: TierMarkupBps = {
  homeownerMarkupBps: 15800,
  contractorMarkupBps: 12900,
  wholesaleMarkupBps: 12500,
};

describe("affiliate contractor markup", () => {
  it("stores percent over cost as basis points and rejects values outside 0 to 200 or past 2 decimals", () => {
    expect(markupPercentToBps(29.5)).toBe(2950);
    expect(markupBpsToPercent(2950)).toBe(29.5);
    expect(markupPercentToBps(0)).toBe(0);
    expect(markupPercentToBps(AFFILIATE_CONTRACTOR_MARKUP_MAX_PERCENT)).toBe(20000);
    expect(isAffiliateContractorMarkupPercent(0)).toBe(true);
    expect(isAffiliateContractorMarkupPercent(200)).toBe(true);
    expect(isAffiliateContractorMarkupPercent(29.25)).toBe(true);
    expect(isAffiliateContractorMarkupPercent(-0.01)).toBe(false);
    expect(isAffiliateContractorMarkupPercent(200.01)).toBe(false);
    expect(isAffiliateContractorMarkupPercent(10.001)).toBe(false);
  });

  it("derives the site default as percent over cost from the contractor multiplier", () => {
    expect(siteContractorMarkupPercent(12900)).toBe(29);
    expect(siteContractorMarkupPercent(10000)).toBe(0);
    expect(siteContractorMarkupPercent(15800)).toBe(58);
    expect(siteContractorMarkupPercent(12950)).toBe(29.5);
  });

  it("prices a contractor SKU at cost times one plus the affiliate percent and leaves other tiers alone", () => {
    const row = { yourCost: 100, wholesalePrice: 80, listPrice: 90 };
    expect(affiliateContractorSellPrice(row, SETTINGS, 29)).toBe(129);
    expect(affiliateContractorSellPrice(row, SETTINGS, 0)).toBe(100);
    expect(affiliateContractorSellPrice(row, SETTINGS, 200)).toBe(300);
    expect(sellPriceForTier(row, SETTINGS, "contractor")).toBe(129);
    expect(sellPriceForTier(row, SETTINGS, "homeowner")).toBe(158);
    const overridden = pricingSettingsWithAffiliateContractorMarkup(SETTINGS, 5000);
    expect(sellPriceForTier(row, overridden, "contractor")).toBe(150);
    expect(sellPriceForTier(row, overridden, "homeowner")).toBe(158);
    expect(sellPriceForTier(row, overridden, "wholesale")).toBe(125);
    expect(pricingSettingsWithAffiliateContractorMarkup(SETTINGS, null)).toBe(SETTINGS);
  });
});
