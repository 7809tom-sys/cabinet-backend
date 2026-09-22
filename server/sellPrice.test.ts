import { describe, it, expect } from "vitest";
import {
  resolveCostBase,
  sellPriceForTier,
  type TierMarkupBps,
} from "../shared/margins";

// Admin config from the screenshot: Homeowner +65%, Contractor +29%, Wholesale +25%.
// Global default (100%) must NOT participate in the sell math.
const SETTINGS: TierMarkupBps = {
  homeownerMarkupBps: 16500,
  contractorMarkupBps: 12900,
  wholesaleMarkupBps: 12500,
};

describe("resolveCostBase", () => {
  it("prefers yourCost first (= list x distributor multiplier = our true cost)", () => {
    expect(
      resolveCostBase({
        yourCost: "162.60",
        wholesalePrice: "271.00",
        adjustedListPrice: "433.60",
        listPrice: "542.00",
      })
    ).toBe(162.6);
  });

  it("falls back to wholesalePrice, then adjustedListPrice, then listPrice", () => {
    expect(resolveCostBase({ wholesalePrice: "271.00" })).toBe(271);
    expect(resolveCostBase({ adjustedListPrice: "433.60" })).toBe(433.6);
    expect(resolveCostBase({ listPrice: "542.00" })).toBe(542);
  });

  it("returns null when no usable column exists", () => {
    expect(resolveCostBase({})).toBeNull();
    expect(resolveCostBase({ yourCost: "" })).toBeNull();
    expect(resolveCostBase({ yourCost: "abc" })).toBeNull();
  });
});

describe("sellPriceForTier", () => {
  it("matches the admin Live Preview: a $100 base becomes $165/$129/$125", () => {
    const row = { wholesalePrice: 100 };
    expect(sellPriceForTier(row, SETTINGS, "homeowner")).toBe(165);
    expect(sellPriceForTier(row, SETTINGS, "contractor")).toBe(129);
    expect(sellPriceForTier(row, SETTINGS, "wholesale")).toBe(125);
  });

  it("computes homeowner from yourCost (our true cost), never the stored homeownerPrice (no compounding)", () => {
    // Real B-12 SKU: yourCost 162.60 is the cost base -> 162.60 * 1.65 = 268.29.
    // wholesalePrice (271) and the stored homeownerPrice are IGNORED.
    const row = {
      yourCost: "162.60",
      wholesalePrice: "271.00",
    };
    expect(sellPriceForTier(row, SETTINGS, "homeowner")).toBe(268.29);
  });

  it("uses the homeowner markup even when a legacy source-list flag is present", () => {
    const row = {
      yourCost: "149.10",
      listPrice: "497.00",
      retailPriceBasis: "source_list" as const,
    };
    expect(sellPriceForTier(row, SETTINGS, "homeowner")).toBe(246.02);
    expect(sellPriceForTier(row, SETTINGS, "contractor")).toBe(192.34);
    expect(sellPriceForTier(row, SETTINGS, "wholesale")).toBe(186.38);
  });

  it("ignores the global default markup entirely", () => {
    // Even if a caller passed a settings object that somehow carried a global,
    // sellPriceForTier only reads the per-tier bps.
    const row = { wholesalePrice: 200 };
    expect(sellPriceForTier(row, SETTINGS, "homeowner")).toBe(330); // 200 * 1.65
  });

  it("returns null when there is no cost base", () => {
    expect(sellPriceForTier({}, SETTINGS, "homeowner")).toBeNull();
  });

  it("0% (neutral 10000 bps) leaves the cost base unchanged", () => {
    const neutral: TierMarkupBps = {
      homeownerMarkupBps: 10000,
      contractorMarkupBps: 10000,
      wholesaleMarkupBps: 10000,
    };
    expect(sellPriceForTier({ wholesalePrice: 271 }, neutral, "homeowner")).toBe(271);
  });
});
