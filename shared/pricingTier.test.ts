import { describe, it, expect } from "vitest";
import {
  resolveTierPrice,
  normalizeTier,
  tierLabel,
  DEFAULT_PRICING_TIER,
  PRICING_TIERS,
  ownerCostBreakdown,
  visiblePricesForViewer,
} from "./pricingTier";

describe("normalizeTier", () => {
  it("accepts valid tiers case-insensitively", () => {
    expect(normalizeTier("wholesale")).toBe("wholesale");
    expect(normalizeTier("Contractor")).toBe("contractor");
    expect(normalizeTier("HOMEOWNER")).toBe("homeowner");
  });
  it("falls back to default for junk", () => {
    expect(normalizeTier("vip")).toBe(DEFAULT_PRICING_TIER);
    expect(normalizeTier(null)).toBe(DEFAULT_PRICING_TIER);
    expect(normalizeTier(undefined)).toBe(DEFAULT_PRICING_TIER);
    expect(normalizeTier(42)).toBe(DEFAULT_PRICING_TIER);
  });
  it("default tier is homeowner (retail) so trade pricing is never leaked by default", () => {
    expect(DEFAULT_PRICING_TIER).toBe("homeowner");
  });
});

describe("tierLabel", () => {
  it("returns human-readable labels", () => {
    expect(tierLabel("wholesale")).toBe("Wholesale");
    expect(tierLabel("contractor")).toBe("Contractor");
    expect(tierLabel("homeowner")).toBe("Homeowner");
  });
});

describe("resolveTierPrice", () => {
  const full = {
    wholesalePrice: 100,
    contractorPrice: 120,
    homeownerPrice: 160,
    adjustedListPrice: 200,
    listPrice: 220,
  };

  it("picks the tier-specific column when present", () => {
    expect(resolveTierPrice("wholesale", full)).toBe(100);
    expect(resolveTierPrice("contractor", full)).toBe(120);
    expect(resolveTierPrice("homeowner", full)).toBe(160);
  });

  it("homeowner falls back to adjustedListPrice then listPrice", () => {
    expect(resolveTierPrice("homeowner", { adjustedListPrice: 200, listPrice: 220 })).toBe(200);
    expect(resolveTierPrice("homeowner", { listPrice: 220 })).toBe(220);
  });

  it("does not expose contractor or wholesale values when no approved customer price exists", () => {
    expect(resolveTierPrice("homeowner", { contractorPrice: 120 })).toBeNull();
    expect(resolveTierPrice("homeowner", { wholesalePrice: 100 })).toBeNull();
  });

  it("wholesale falls back to contractor when wholesale missing", () => {
    expect(resolveTierPrice("wholesale", { contractorPrice: 120 })).toBe(120);
  });

  it("contractor falls back to wholesale when contractor missing", () => {
    expect(resolveTierPrice("contractor", { wholesalePrice: 100 })).toBe(100);
  });

  it("accepts string prices (decimal columns)", () => {
    expect(resolveTierPrice("wholesale", { wholesalePrice: "99.50" })).toBe(99.5);
  });

  it("returns null when no usable price exists", () => {
    expect(resolveTierPrice("wholesale", {})).toBeNull();
    expect(resolveTierPrice("homeowner", { homeownerPrice: "" })).toBeNull();
  });

  it("homeowner is always >= trade tiers in a normal price set (retail is highest)", () => {
    const h = resolveTierPrice("homeowner", full)!;
    const c = resolveTierPrice("contractor", full)!;
    const w = resolveTierPrice("wholesale", full)!;
    expect(h).toBeGreaterThanOrEqual(c);
    expect(c).toBeGreaterThanOrEqual(w);
  });

  it("covers all declared tiers", () => {
    for (const t of PRICING_TIERS) {
      expect(resolveTierPrice(t, full)).toBeTypeOf("number");
    }
  });
});

describe("ownerCostBreakdown (owner-only cost vs sell)", () => {
  // `full` has an explicit true acquisition cost (`yourCost`) distinct from the
  // wholesale SELL price — this is the real-world case that surfaced the bug.
  const full = {
    yourCost: 60,
    wholesalePrice: 100,
    contractorPrice: 120,
    homeownerPrice: 160,
    adjustedListPrice: 200,
    listPrice: 220,
  };

  it("myCost uses the true acquisition cost (yourCost), not the wholesale price", () => {
    expect(ownerCostBreakdown(full, "homeowner").myCost).toBe(60);
    expect(ownerCostBreakdown(full, "contractor").myCost).toBe(60);
    expect(ownerCostBreakdown(full, "wholesale").myCost).toBe(60);
  });

  it("falls back to the wholesale floor when yourCost is missing", () => {
    const noCost = { ...full, yourCost: undefined };
    expect(ownerCostBreakdown(noCost, "homeowner").myCost).toBe(100);
    expect(ownerCostBreakdown(noCost, "wholesale").myCost).toBe(100);
  });

  it("sellPrice follows the supplied tier", () => {
    expect(ownerCostBreakdown(full, "homeowner").sellPrice).toBe(160);
    expect(ownerCostBreakdown(full, "contractor").sellPrice).toBe(120);
    expect(ownerCostBreakdown(full, "wholesale").sellPrice).toBe(100);
  });

  it("computes margin dollars and percent for a homeowner sale", () => {
    const b = ownerCostBreakdown(full, "homeowner");
    expect(b.marginDollars).toBe(100); // 160 - 60
    expect(b.marginPct).toBe(62.5); // 100 / 160
  });

  it("a wholesale sale still nets margin over the true cost", () => {
    const b = ownerCostBreakdown(full, "wholesale");
    expect(b.marginDollars).toBe(40); // 100 - 60
    expect(b.marginPct).toBe(40); // 40 / 100
  });

  it("returns nulls when cost or sell price is unknown", () => {
    expect(ownerCostBreakdown({}, "homeowner")).toEqual({
      myCost: null,
      sellPrice: null,
      marginDollars: null,
      marginPct: null,
    });
  });

  it("marginPct is null when sellPrice is 0 (avoids divide-by-zero)", () => {
    const b = ownerCostBreakdown({ wholesalePrice: 0, homeownerPrice: 0 }, "homeowner");
    expect(b.marginDollars).toBe(0);
    expect(b.marginPct).toBeNull();
  });
});

describe("visiblePricesForViewer (server-side column gating)", () => {
  const row = {
    listPrice: 220,
    adjustedListPrice: 200,
    wholesalePrice: 100,
    contractorPrice: 120,
    homeownerPrice: 160,
  };

  it("admin sees every column (clone, not mutated)", () => {
    const out = visiblePricesForViewer(row, "homeowner", true);
    expect(out).toEqual(row);
    expect(out).not.toBe(row);
  });

  it("homeowner never sees wholesale or contractor cost", () => {
    const out = visiblePricesForViewer(row, "homeowner", false);
    expect(out.wholesalePrice).toBeNull();
    expect(out.contractorPrice).toBeNull();
    expect(out.homeownerPrice).toBe(160);
    expect(out.listPrice).toBe(220);
  });

  it("contractor sees contractor + homeowner but NOT wholesale base", () => {
    const out = visiblePricesForViewer(row, "contractor", false);
    expect(out.wholesalePrice).toBeNull();
    expect(out.contractorPrice).toBe(120);
    expect(out.homeownerPrice).toBe(160);
  });

  it("wholesale pro sees all trade columns", () => {
    const out = visiblePricesForViewer(row, "wholesale", false);
    expect(out.wholesalePrice).toBe(100);
    expect(out.contractorPrice).toBe(120);
  });

  it("does not mutate the input row", () => {
    visiblePricesForViewer(row, "homeowner", false);
    expect(row.wholesalePrice).toBe(100);
  });
});
