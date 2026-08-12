import { describe, expect, it } from "vitest";
import { calculateCartLineTotal, resolveAffiliateCartUnitPrice } from "./affiliateCartPricing";

describe("resolveAffiliateCartUnitPrice", () => {
  it("preserves the stored marked-up homeowner price for affiliate carts", () => {
    expect(
      resolveAffiliateCartUnitPrice({
        storedUnitPrice: 137.5,
        liveUnitPrice: 100,
        tier: "homeowner",
        isAffiliateCart: true,
      }),
    ).toBe(137.5);
  });

  it("uses the live tier price for a normal non-affiliate cart", () => {
    expect(
      resolveAffiliateCartUnitPrice({
        storedUnitPrice: 137.5,
        liveUnitPrice: 100,
        tier: "homeowner",
        isAffiliateCart: false,
      }),
    ).toBe(100);
  });

  it("falls back to the stored price when the live price is unavailable", () => {
    expect(
      resolveAffiliateCartUnitPrice({
        storedUnitPrice: 137.5,
        liveUnitPrice: null,
        tier: "homeowner",
        isAffiliateCart: false,
      }),
    ).toBe(137.5);
  });

  it("does not preserve a stored price for a non-homeowner affiliate tier", () => {
    expect(
      resolveAffiliateCartUnitPrice({
        storedUnitPrice: 137.5,
        liveUnitPrice: 100,
        tier: "contractor",
        isAffiliateCart: true,
      }),
    ).toBe(100);
  });
});

describe("calculateCartLineTotal", () => {
  it("rounds line totals to cents", () => {
    expect(calculateCartLineTotal(137.5, 3)).toBe(412.5);
  });

  it("returns null for an unavailable or invalid line price", () => {
    expect(calculateCartLineTotal(null, 1)).toBeNull();
    expect(calculateCartLineTotal(Number.NaN, 1)).toBeNull();
    expect(calculateCartLineTotal(10, 0)).toBeNull();
  });
});
