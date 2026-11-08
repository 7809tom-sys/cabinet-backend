import { describe, expect, it } from "vitest";
import {
  DEFAULT_AFFILIATE_MARKUP_BPS,
  REAVES_WAY_AFFILIATE_BLUEPRINT,
  reavesWayAffiliateDefaults,
} from "./affiliateBlueprint";

describe("Reaves Way affiliate blueprint", () => {
  it("provides the approved structural storefront and pricing defaults for future affiliates", () => {
    expect(reavesWayAffiliateDefaults()).toEqual({
      template: "showcase",
      primaryColor: "#1ceb31",
      accentColor: "#0000ff",
      buttonRadius: "9999px",
      defaultMarkupBps: 4000,
      hardwareMarkupBps: 4000,
    });
  });

  it("starts every new affiliate at a 40% markup on everything, hardware included", () => {
    expect(DEFAULT_AFFILIATE_MARKUP_BPS).toBe(4000);
    expect(reavesWayAffiliateDefaults().defaultMarkupBps).toBe(4000);
    expect(reavesWayAffiliateDefaults().hardwareMarkupBps).toBe(4000);
  });

  it("does not expose identity-specific customer-facing content in the reusable blueprint", () => {
    expect(Object.keys(REAVES_WAY_AFFILIATE_BLUEPRINT)).not.toContain(
      "storeName"
    );
    expect(Object.keys(REAVES_WAY_AFFILIATE_BLUEPRINT)).not.toContain("slug");
  });
});
