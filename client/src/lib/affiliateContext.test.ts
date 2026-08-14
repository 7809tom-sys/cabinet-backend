import { describe, expect, it } from "vitest";
import { affiliateSlugFromHostname, affiliateStorefrontFallbackPath } from "./affiliateContext";

describe("affiliate custom-domain client fallback", () => {
  it("derives the branded slug from the single-level public host", () => {
    expect(affiliateSlugFromHostname("reaves-way-cabinet-shop.cabinetdealz.com")).toBe("reaves-way-cabinet-shop");
    expect(affiliateSlugFromHostname("www.cabinetdealz.com")).toBeNull();
    expect(affiliateSlugFromHostname("nested.reaves-way-cabinet-shop.cabinetdealz.com")).toBeNull();
  });

  it("rewrites a transparent-proxy cabinet detail visit into the affiliate route while preserving the query", () => {
    expect(affiliateStorefrontFallbackPath(
      "/catalog/W-12-30",
      "reaves-way-cabinet-shop.cabinetdealz.com",
      "?style=330005&cabinetId=9360055",
    )).toBe("/store/reaves-way-cabinet-shop/catalog/W-12-30?style=330005&cabinetId=9360055");
    expect(affiliateStorefrontFallbackPath("/store/reaves-way-cabinet-shop/catalog/W-12-30", "reaves-way-cabinet-shop.cabinetdealz.com")).toBeNull();
  });
});
