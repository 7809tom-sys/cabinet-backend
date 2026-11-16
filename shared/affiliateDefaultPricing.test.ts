import { describe, expect, it } from "vitest";
import {
  AFFILIATE_DEFAULT_FEE_BPS,
  AFFILIATE_DEFAULT_MARKUP_BPS,
  defaultAffiliateCostCents,
  defaultAffiliateSaleCents,
} from "./affiliateDefaultPricing";
import { resolveAffiliateStorefrontSale } from "./affiliateBranding";
import { DEFAULT_PRICING_SETTINGS } from "./pricing";
import { unassignedAffiliateTier } from "./affiliatePricingTier";

// A live settings row may still carry the old 5% platform affiliate value.
// The storefront default must not depend on it.
const oldSettings = { ...DEFAULT_PRICING_SETTINGS, affiliateMarkupBps: 500 };

describe("site-wide default affiliate price: business cost × 1.10 × 1.40", () => {
  it("keeps the fee and markup as separate named constants", () => {
    expect(AFFILIATE_DEFAULT_FEE_BPS).toBe(1000);
    expect(AFFILIATE_DEFAULT_MARKUP_BPS).toBe(4000);
  });

  it("prices $100.00 business cost at $154.00", () => {
    expect(defaultAffiliateCostCents(10000)).toBe(11000);
    expect(defaultAffiliateSaleCents(10000)).toBe(15400);
  });

  it("rounds half-up to whole cents after each step", () => {
    // $231.58 USCD DCW2442 landed cost → $254.74 (254.738) → $356.64 (356.636)
    expect(defaultAffiliateCostCents(23158)).toBe(25474);
    expect(defaultAffiliateSaleCents(23158)).toBe(35664);
    // $0.05 → 5.5 rounds to 6 → 8.4 rounds to 8
    expect(defaultAffiliateSaleCents(5)).toBe(8);
  });

  it("returns null instead of inventing a price when business cost is missing", () => {
    expect(defaultAffiliateSaleCents(null)).toBeNull();
    expect(defaultAffiliateSaleCents(0)).toBeNull();
    expect(defaultAffiliateSaleCents(Number.NaN)).toBeNull();
  });

  it("gives an affiliate with no tier the default, ignoring the legacy platform 5%", () => {
    const sale = resolveAffiliateStorefrontSale(10000, oldSettings, { globalMarkupBps: 4000 }, { tier: null });
    expect(sale.affiliateCostCents).toBe(11000);
    expect(sale.retailCents).toBe(15400);
    expect(sale.costSource).toBe("platform_default");
  });

  it("uses the default 40% markup when the affiliate has no usable markup value", () => {
    const sale = resolveAffiliateStorefrontSale(10000, oldSettings, { globalMarkupBps: Number.NaN }, { tier: null });
    expect(sale.retailCents).toBe(15400);
  });

  it("lets a per-affiliate tier override the default fee", () => {
    const sale = resolveAffiliateStorefrontSale(10000, oldSettings, { globalMarkupBps: 4000 }, {
      tier: { basis: "cost_multiplier", basisPoints: 12000 },
    });
    expect(sale.affiliateCostCents).toBe(12000);
    expect(sale.retailCents).toBe(16800);
    expect(sale.costSource).toBe("tier_cost_multiplier");
  });

  it("lets a per-affiliate markup override the default markup", () => {
    const sale = resolveAffiliateStorefrontSale(10000, oldSettings, { globalMarkupBps: 2500 }, { tier: null });
    expect(sale.retailCents).toBe(13750);
  });

  it("lets a style or category markup win over the affiliate default", () => {
    const markup = { globalMarkupBps: 4000, categoryMarkupBps: { Base: 3000 }, styleMarkupBps: { 7: 5000 } };
    expect(resolveAffiliateStorefrontSale(10000, oldSettings, markup, { categoryKey: "Base" }).retailCents).toBe(14300);
    expect(resolveAffiliateStorefrontSale(10000, oldSettings, markup, { categoryKey: "Base", styleId: 7 }).retailCents).toBe(16500);
  });

  it("tells an unassigned affiliate the default in the dashboard", () => {
    expect(unassignedAffiliateTier().summary).toContain("business cost + 10% fees");
  });
});
