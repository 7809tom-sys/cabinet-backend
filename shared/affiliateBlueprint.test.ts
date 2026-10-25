import { describe, expect, it } from "vitest";
import { REAVES_WAY_AFFILIATE_BLUEPRINT, reavesWayAffiliateDefaults } from "./affiliateBlueprint";

describe("Reaves Way affiliate blueprint", () => {
  it("provides the approved structural storefront and pricing defaults for future affiliates", () => {
    expect(reavesWayAffiliateDefaults()).toEqual({
      template: "showcase",
      primaryColor: "#1ceb31",
      accentColor: "#0000ff",
      buttonRadius: "9999px",
      defaultMarkupBps: 5500,
    });
  });

  it("does not expose identity-specific customer-facing content in the reusable blueprint", () => {
    expect(Object.keys(REAVES_WAY_AFFILIATE_BLUEPRINT)).not.toContain("storeName");
    expect(Object.keys(REAVES_WAY_AFFILIATE_BLUEPRINT)).not.toContain("slug");
  });
});
