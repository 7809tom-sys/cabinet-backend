import { affiliateStorefrontPath, affiliateStorefrontUrl } from "./affiliateStorefrontUrl";
import { describe, expect, it } from "vitest";

describe("affiliate storefront URLs", () => {
  it("builds the canonical routed storefront path for each affiliate slug", () => {
    expect(affiliateStorefrontPath("firstclass")).toBe("/store/firstclass");
    expect(affiliateStorefrontPath("reaves-way-cabinet-shop")).toBe("/store/reaves-way-cabinet-shop");
  });

  it("uses the active application origin and never emits a legacy subdomain URL", () => {
    expect(affiliateStorefrontUrl("reaves-way-cabinet-shop", "https://www.cabinetdealz.com/")).toBe(
      "https://www.cabinetdealz.com/store/reaves-way-cabinet-shop"
    );
    expect(affiliateStorefrontUrl("firstclass", "https://preview.manus.com")).toBe(
      "https://preview.manus.com/store/firstclass"
    );
  });
});
