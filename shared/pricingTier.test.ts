import { describe, it, expect } from "vitest";
import {
  resolveTierPrice,
  normalizeTier,
  tierLabel,
  DEFAULT_PRICING_TIER,
  PRICING_TIERS,
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
