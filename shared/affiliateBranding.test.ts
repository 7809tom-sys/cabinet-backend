import { describe, it, expect } from "vitest";
import {
  resolveBrandName,
  resolveMarkupBps,
  resolveAffiliateRetail,
  type AffiliateMarkup,
} from "./affiliateBranding";

describe("resolveBrandName", () => {
  it("uses the affiliate override when set", () => {
    expect(resolveBrandName("Aspen White", "Coastal White")).toBe("Coastal White");
  });
  it("falls back to the central name when override is blank/null/undefined", () => {
    expect(resolveBrandName("Aspen White", "")).toBe("Aspen White");
    expect(resolveBrandName("Aspen White", "   ")).toBe("Aspen White");
    expect(resolveBrandName("Aspen White", null)).toBe("Aspen White");
    expect(resolveBrandName("Aspen White", undefined)).toBe("Aspen White");
  });
  it("trims the override", () => {
    expect(resolveBrandName("Aspen White", "  Coastal White  ")).toBe("Coastal White");
  });
});

describe("resolveMarkupBps (precedence style > category > global)", () => {
  const markup: AffiliateMarkup = {
    globalMarkupBps: 2000, // 20%
    categoryMarkupBps: { base: 2500, wall: 1500 },
    styleMarkupBps: { 7: 3000 },
  };

  it("returns the global default when no overrides match", () => {
    expect(resolveMarkupBps(markup, {})).toBe(2000);
    expect(resolveMarkupBps(markup, { categoryKey: "tall", styleId: 99 })).toBe(2000);
  });
  it("uses a category override over the global", () => {
    expect(resolveMarkupBps(markup, { categoryKey: "base" })).toBe(2500);
    expect(resolveMarkupBps(markup, { categoryKey: "wall" })).toBe(1500);
  });
  it("uses a style override over both category and global", () => {
    expect(resolveMarkupBps(markup, { categoryKey: "base", styleId: 7 })).toBe(3000);
  });
  it("ignores invalid/negative overrides and falls through", () => {
    const m: AffiliateMarkup = {
      globalMarkupBps: 1000,
      categoryMarkupBps: { base: -5 },
      styleMarkupBps: { 7: NaN as unknown as number },
    };
    expect(resolveMarkupBps(m, { categoryKey: "base", styleId: 7 })).toBe(1000);
  });
  it("treats 0 as a valid explicit markup (cost = retail)", () => {
    const m: AffiliateMarkup = { globalMarkupBps: 2000, categoryMarkupBps: { base: 0 } };
    expect(resolveMarkupBps(m, { categoryKey: "base" })).toBe(0);
  });
});

describe("resolveAffiliateRetail", () => {
  const markup: AffiliateMarkup = {
    globalMarkupBps: 2000,
    categoryMarkupBps: { base: 5000 },
    styleMarkupBps: { 7: 10000 },
  };

  it("applies the global markup", () => {
    const r = resolveAffiliateRetail(10000, markup, {});
    expect(r.markupBps).toBe(2000);
    expect(r.retailCents).toBe(12000);
    expect(r.profitCents).toBe(2000);
  });
  it("applies a category override", () => {
    const r = resolveAffiliateRetail(10000, markup, { categoryKey: "base" });
    expect(r.retailCents).toBe(15000);
    expect(r.profitCents).toBe(5000);
  });
  it("applies a style override (doubles cost at 100%)", () => {
    const r = resolveAffiliateRetail(10000, markup, { categoryKey: "base", styleId: 7 });
    expect(r.retailCents).toBe(20000);
  });
  it("clamps negative cost to zero", () => {
    const r = resolveAffiliateRetail(-500, markup, {});
    expect(r.affiliateCostCents).toBe(0);
    expect(r.retailCents).toBe(0);
  });
  it("rounds to whole cents", () => {
    const r = resolveAffiliateRetail(333, { globalMarkupBps: 333 }, {});
    expect(Number.isInteger(r.retailCents)).toBe(true);
  });
});
