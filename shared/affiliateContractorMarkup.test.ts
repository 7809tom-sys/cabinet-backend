import { describe, expect, it } from "vitest";
import { sellPriceForTier, type AffiliateContractorCostContext, type TierMarkupBps } from "./margins";
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

  it("prices a contractor SKU over the affiliate's cost and leaves other tiers alone", () => {
    const row = { yourCost: 100, wholesalePrice: 80, listPrice: 90 };
    // No tier and no platform markup: the affiliate's cost equals Cabinet Dealz cost.
    expect(affiliateContractorSellPrice(row, SETTINGS, 29)).toBe(129);
    expect(affiliateContractorSellPrice(row, SETTINGS, 0)).toBe(100);
    expect(affiliateContractorSellPrice(row, SETTINGS, 200)).toBe(300);
    expect(sellPriceForTier(row, SETTINGS, "contractor")).toBe(129);
    expect(sellPriceForTier(row, SETTINGS, "homeowner")).toBe(158);
    const overridden = pricingSettingsWithAffiliateContractorMarkup(SETTINGS, 5000);
    expect(overridden.contractorMarkupBps).toBe(15000);
    expect(sellPriceForTier(row, overridden, "contractor")).toBe(150);
    expect(sellPriceForTier(row, overridden, "homeowner")).toBe(158);
    expect(sellPriceForTier(row, overridden, "wholesale")).toBe(125);
    expect(pricingSettingsWithAffiliateContractorMarkup(SETTINGS, null)).toBe(SETTINGS);
  });

  const storeTier: AffiliateContractorCostContext = {
    markupBps: 2900,
    tier: { basis: "cost_multiplier", basisPoints: 12000 },
    platformAffiliateMarkupBps: 500,
  };

  it("applies 29% over a $120 affiliate tier cost, not over the $100 Cabinet Dealz cost", () => {
    const row = { yourCost: 100, wholesalePrice: 80, listPrice: 250, category: "Base" };
    const settings = { ...SETTINGS, affiliateContractorCost: storeTier };
    expect(affiliateContractorSellPrice(row, SETTINGS, 29, {
      tier: storeTier.tier,
      platformAffiliateMarkupBps: storeTier.platformAffiliateMarkupBps,
    })).toBe(154.8);
    expect(sellPriceForTier(row, settings, "contractor")).toBe(154.8);
    expect(sellPriceForTier(row, settings, "contractor")).not.toBe(129);
    // Other tiers stay on Cabinet Dealz pricing, including a printed source list.
    expect(sellPriceForTier(row, settings, "homeowner")).toBe(158);
    expect(sellPriceForTier(row, settings, "wholesale")).toBe(125);
    expect(sellPriceForTier({ ...row, retailPriceBasis: "source_list" }, settings, "homeowner")).toBe(250);
    expect(sellPriceForTier({ ...row, retailPriceBasis: "source_list" }, settings, "contractor")).toBe(154.8);
  });

  it("uses the platform affiliate markup when the store has no active tier", () => {
    const settings = {
      ...SETTINGS,
      affiliateContractorCost: {
        markupBps: 2900,
        tier: null,
        platformAffiliateMarkupBps: 500,
      },
    };
    // $100 Cabinet Dealz cost × 1.05 = $105 affiliate cost. 29% over that is $135.45.
    expect(sellPriceForTier({ yourCost: 100, category: "Base" }, settings, "contractor")).toBe(135.45);
  });

  it("prices a list-discount store from list, then applies the contractor markup", () => {
    const settings = {
      ...SETTINGS,
      affiliateContractorCost: {
        markupBps: 2900,
        tier: { basis: "list_discount" as const, basisPoints: 1000 },
        platformAffiliateMarkupBps: 500,
      },
    };
    // 10% off a $200 list is a $180 affiliate cost. 29% over that is $232.20.
    expect(sellPriceForTier({ yourCost: 100, listPrice: 200, category: "Base" }, settings, "contractor")).toBe(232.2);
  });

  it("prices flooring and appliances from the 40/60 split, ignoring the cabinet tier", () => {
    const settings = { ...SETTINGS, affiliateContractorCost: storeTier };
    const flooring = { yourCost: 100, listPrice: 200, category: "Flooring" };
    const appliances = { yourCost: "100.00", listPrice: "200.00", category: "Appliances" };
    // $100 cost, $200 retail. Affiliate cost is $140. 29% over that is $180.60.
    // The cabinet tier would have made the affiliate cost $120 and the price $154.80.
    expect(sellPriceForTier(flooring, settings, "contractor")).toBe(180.6);
    expect(sellPriceForTier(appliances, settings, "contractor")).toBe(180.6);
    expect(sellPriceForTier(flooring, settings, "homeowner")).toBe(158);
  });

  it("keeps the site contractor price when affiliate cost cannot be resolved", () => {
    const settings = {
      ...SETTINGS,
      affiliateContractorCost: { ...storeTier, markupBps: 5000 },
    };
    const row = { yourCost: null, wholesalePrice: 80, listPrice: null, category: "Base" };
    expect(sellPriceForTier(row, settings, "contractor")).toBe(103.2);
    expect(sellPriceForTier(row, SETTINGS, "contractor")).toBe(103.2);
  });
});
