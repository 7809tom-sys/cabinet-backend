import { describe, expect, it } from "vitest";
import { canViewAffiliatePrivateCost } from "./affiliatePrivateCost";

describe("affiliate private-cost access", () => {
  it("allows the master admin and the owner on the matching storefront", () => {
    expect(canViewAffiliatePrivateCost({ isAdmin: true })).toBe(true);
    expect(canViewAffiliatePrivateCost({
      isAdmin: false,
      requestedAffiliateSlug: "reaves-way-cabinet-shop",
      requestedAffiliateId: 21,
      access: { affiliateId: 21, isOwner: true },
    })).toBe(true);
  });

  it("denies customers, affiliate staff, direct-site views, and another affiliate's storefront", () => {
    const owner = { affiliateId: 21, isOwner: true };
    expect(canViewAffiliatePrivateCost({ isAdmin: false, access: owner })).toBe(false);
    expect(canViewAffiliatePrivateCost({ isAdmin: false, requestedAffiliateSlug: "other", requestedAffiliateId: 22, access: owner })).toBe(false);
    expect(canViewAffiliatePrivateCost({ isAdmin: false, requestedAffiliateSlug: "reaves-way-cabinet-shop", requestedAffiliateId: 21, access: { affiliateId: 21, isOwner: false } })).toBe(false);
    expect(canViewAffiliatePrivateCost({ isAdmin: false, requestedAffiliateSlug: "reaves-way-cabinet-shop", requestedAffiliateId: 21 })).toBe(false);
  });
});
