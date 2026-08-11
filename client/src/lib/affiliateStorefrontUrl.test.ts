import { affiliateStorefrontPath, affiliateStorefrontUrl, copyAffiliateStorefrontLink } from "./affiliateStorefrontUrl";
import { describe, expect, it, vi } from "vitest";

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

  it("copies the canonical storefront URL for the selected affiliate row", async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };

    await copyAffiliateStorefrontLink("reaves-way-cabinet-shop", {
      origin: "https://www.cabinetdealz.com",
      clipboard,
    });

    expect(clipboard.writeText).toHaveBeenCalledWith(
      "https://www.cabinetdealz.com/store/reaves-way-cabinet-shop"
    );
  });
});
