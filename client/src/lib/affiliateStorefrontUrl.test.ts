import { affiliateDashboardLinks, affiliateDashboardPath, affiliateStorefrontPath, affiliateStorefrontUrl, copyAffiliateStorefrontLink } from "./affiliateStorefrontUrl";
import { describe, expect, it, vi } from "vitest";

describe("affiliate storefront URLs", () => {
  it("builds an explicit dashboard address for the requested affiliate", () => {
    expect(affiliateDashboardPath(1)).toBe("/affiliate?viewAs=1");
    expect(affiliateDashboardPath(5730001)).toBe("/affiliate?viewAs=5730001");
  });

  it("keeps First Class and Reaves Way dashboard HTML links isolated", () => {
    expect(affiliateDashboardLinks(
      { slug: "firstclass", referralCode: "FIRSTCLASS" },
      "https://www.cabinetdealz.com",
    )).toEqual({
      storefrontUrl: "https://www.cabinetdealz.com/store/firstclass",
      referralUrl: "https://www.cabinetdealz.com/order/new?ref=FIRSTCLASS",
    });
    expect(affiliateDashboardLinks(
      { slug: "reaves-way-cabinet-shop", referralCode: "REAVESWAYCABINETSHOP" },
      "https://www.cabinetdealz.com",
    )).toEqual({
      storefrontUrl: "https://www.cabinetdealz.com/store/reaves-way-cabinet-shop",
      referralUrl: "https://www.cabinetdealz.com/order/new?ref=REAVESWAYCABINETSHOP",
    });
  });

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
