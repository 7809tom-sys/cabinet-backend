import { describe, expect, it } from "vitest";
import { affiliateCustomerPosition, canViewAffiliateDesignPriceList } from "./affiliateDesignPriceList";

describe("affiliate design price list access", () => {
  it("allows only an affiliate owner viewing their own storefront", () => {
    expect(canViewAffiliateDesignPriceList({ isAdmin: false, access: { affiliateId: 7, isOwner: true }, requestedAffiliateId: 7 })).toBe(true);
    expect(canViewAffiliateDesignPriceList({ isAdmin: false, access: { affiliateId: 7, isOwner: false }, requestedAffiliateId: 7 })).toBe(false);
    expect(canViewAffiliateDesignPriceList({ isAdmin: false, access: { affiliateId: 7, isOwner: true }, requestedAffiliateId: 8 })).toBe(false);
    expect(canViewAffiliateDesignPriceList({ isAdmin: true, access: { affiliateId: 7, isOwner: true }, requestedAffiliateId: 7 })).toBe(false);
  });

  it("returns customer, affiliate, and position totals without any supplier cost", () => {
    expect(affiliateCustomerPosition(500, 350, 2)).toEqual({
      customerLineTotal: 1000,
      affiliateLineTotal: 700,
      positionDollars: 300,
      positionPercent: 30,
    });
  });
});
