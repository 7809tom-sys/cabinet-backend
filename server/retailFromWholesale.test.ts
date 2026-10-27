import { describe, expect, it } from "vitest";
import { retailFromWholesale, sellPriceForTier, SITE_RETAIL_MULTIPLIER_KEY, type TierMarkupBps } from "../shared/margins";

const SETTINGS: TierMarkupBps = {
  homeownerMarkupBps: 16500,
  contractorMarkupBps: 12900,
  wholesaleMarkupBps: 12500,
};

describe("site-wide retail multiplier", () => {
  it("reuses the existing homeowner markup key", () => {
    expect(SITE_RETAIL_MULTIPLIER_KEY).toBe("pricing_settings.homeownerMarkupBps");
  });

  it("multiplies vendor wholesale and keeps per-vendor and per-category uplifts on top", () => {
    expect(retailFromWholesale(100, 16500)).toBe(165);
    expect(retailFromWholesale(100, 16500, { vendorMarkupPercent: 0.15 })).toBe(189.75);
    expect(retailFromWholesale(100, 20000, { categoryMarkupBps: 1000 })).toBe(220);
  });

  it("uses vendor wholesale for homeowner retail and leaves the cost ladder alone when it is absent", () => {
    const row = { yourCost: "162.60", wholesalePrice: "271.00", vendorWholesale: "100" };
    expect(sellPriceForTier(row, SETTINGS, "homeowner")).toBe(165);
    expect(sellPriceForTier(row, SETTINGS, "contractor")).toBe(209.75);
    expect(sellPriceForTier({ yourCost: "162.60", wholesalePrice: "271.00" }, SETTINGS, "homeowner")).toBe(268.29);
  });

  it("propagates a multiplier change at read time", () => {
    const row = { vendorWholesale: 80, yourCost: 10 };
    expect(sellPriceForTier(row, SETTINGS, "homeowner")).toBe(132);
    expect(sellPriceForTier(row, { ...SETTINGS, homeownerMarkupBps: 20000 }, "homeowner")).toBe(160);
  });
});
