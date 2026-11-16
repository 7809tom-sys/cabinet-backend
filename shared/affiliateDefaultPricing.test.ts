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

describe("affiliate floor: never below business cost × 1.15", async () => {
  const {
    AFFILIATE_FLOOR_BPS,
    affiliateFloorCents,
    clampToAffiliateFloorCents,
    affiliateOverrideMeetsFloor,
    minimumMarkupBpsForFloor,
  } = await import("./affiliateDefaultPricing");
  const { resolveAffiliateTierCost, validateAffiliateTierDraft } = await import("./affiliatePricingTier");

  it("is one 15% constant", () => {
    expect(AFFILIATE_FLOOR_BPS).toBe(1500);
    expect(affiliateFloorCents(10000)).toBe(11500);
  });

  it("keeps the default at 1.54, above the floor", () => {
    expect(resolveAffiliateStorefrontSale(10000, oldSettings, { globalMarkupBps: 4000 }).retailCents).toBe(15400);
  });

  it("clamps an override below 1.15 up to the floor", () => {
    // ×1.00 tier + 5% markup = 1.05 → clamped to 1.15.
    const sale = resolveAffiliateStorefrontSale(10000, oldSettings, { globalMarkupBps: 500 }, {
      tier: { basis: "cost_multiplier", basisPoints: 10000 },
    });
    expect(sale.retailCents).toBe(11500);
    expect(sale.profitCents).toBe(1500);
    // Default fee + 0% markup = 1.10 → clamped to 1.15.
    expect(resolveAffiliateStorefrontSale(10000, oldSettings, { globalMarkupBps: 0 }).retailCents).toBe(11500);
  });

  it("lets an override exactly at 1.15 through unchanged", () => {
    const sale = resolveAffiliateStorefrontSale(10000, oldSettings, { globalMarkupBps: 1500 }, {
      tier: { basis: "cost_multiplier", basisPoints: 10000 },
    });
    expect(sale.retailCents).toBe(11500);
    expect(clampToAffiliateFloorCents(11500, 10000)).toBe(11500);
    expect(clampToAffiliateFloorCents(11499, 10000)).toBe(11500);
    expect(clampToAffiliateFloorCents(9000, null)).toBe(9000);
  });

  it("lets an override below the default but above the floor through", () => {
    expect(resolveAffiliateStorefrontSale(10000, oldSettings, { globalMarkupBps: 2000 }).retailCents).toBe(13200);
  });

  it("prices tom-cabinets-shop's intended cost × 1.55 with a ×1.00 tier and 55% markup", () => {
    // DCW2442 Nova Blanc: $941 list → $231.58 cost → $358.95.
    const sale = resolveAffiliateStorefrontSale(23158, oldSettings, { globalMarkupBps: 5500 }, {
      tier: { basis: "cost_multiplier", basisPoints: 10000 },
      listPriceCents: 94100,
    });
    expect(sale.retailCents).toBe(35895);
  });

  it("decides whether an override save reaches the floor", () => {
    expect(affiliateOverrideMeetsFloor(11000, 455)).toBe(true); // 1.10 × 1.0455 = 1.15005
    expect(affiliateOverrideMeetsFloor(11000, 454)).toBe(false);
    expect(affiliateOverrideMeetsFloor(10000, 1500)).toBe(true);
    expect(affiliateOverrideMeetsFloor(10000, 1499)).toBe(false);
    expect(minimumMarkupBpsForFloor(11000)).toBe(455);
    expect(minimumMarkupBpsForFloor(10000)).toBe(1500);
    expect(minimumMarkupBpsForFloor(12000)).toBe(0);
  });

  it("never prices a cabinet from list, even with a legacy list-discount tier", () => {
    const cost = resolveAffiliateTierCost({
      yourCostCents: 10000,
      listPriceCents: 40000,
      tier: { basis: "list_discount", basisPoints: 0 },
    });
    expect(cost).toEqual({ affiliateCostCents: 11000, source: "platform_default" });
    // tom-cabinets-shop today: 0% off list + 55% → list × 1.55. Now cost-based.
    const sale = resolveAffiliateStorefrontSale(23158, oldSettings, { globalMarkupBps: 5500 }, {
      tier: { basis: "list_discount", basisPoints: 0 },
      listPriceCents: 94100,
    });
    expect(sale.retailCents).toBe(39485); // 231.58 × 1.10 = 254.74, × 1.55 = 394.85
  });

  it("rejects list-based tiers and tiers below cost at save", () => {
    const base = { tierName: "T", basisPoints: 0, volumeThresholdCents: null, examplePlaceholder: false, notes: null, active: true, sortOrder: 0 };
    expect(validateAffiliateTierDraft({ ...base, basis: "list_discount", basisPoints: 1000 }).ok).toBe(false);
    expect(validateAffiliateTierDraft({ ...base, basis: "cost_multiplier", basisPoints: 9999 }).ok).toBe(false);
    expect(validateAffiliateTierDraft({ ...base, basis: "cost_multiplier", basisPoints: 10000 }).ok).toBe(true);
  });
});
