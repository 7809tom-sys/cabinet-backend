import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const affiliateRouter = readFileSync(resolve(process.cwd(), "server/routers/affiliates.ts"), "utf8");
const storefrontRouter = readFileSync(resolve(process.cwd(), "server/routers/storefront.ts"), "utf8");
const designRouter = readFileSync(resolve(process.cwd(), "server/routers/design.ts"), "utf8");

describe("featured distributor analytics", () => {
  it("keeps analytics limited to lines the affiliate has featured", () => {
    expect(affiliateRouter).toContain("myFeaturedDistributorAnalytics");
    expect(affiliateRouter).toContain("affiliateDistributorSelections.featured, true");
    expect(affiliateRouter).toContain("affiliateFeaturedDistributorEvents");
    expect(affiliateRouter).toContain("designLeads.featuredDistributorId");
    expect(affiliateRouter).toContain("myFeaturedStyleAnalytics");
    expect(affiliateRouter).toContain("designLeads.featuredStyleId");
    expect(affiliateRouter).toContain("reorderFeaturedStyles");
  });

  it("records only anonymous per-session views for actually featured storefront lines", () => {
    expect(storefrontRouter).toContain("recordFeaturedDistributorViews");
    expect(storefrontRouter).toContain("sessionKey");
    expect(storefrontRouter).toContain("affiliateDistributorSelections.featured, true");
    expect(storefrontRouter).toContain("existingDistributorIds");
    expect(storefrontRouter).toContain("styleIds");
    expect(storefrontRouter).toContain("affiliateFeaturedDistributorEvents.styleId");
  });

  it("verifies incoming Designer style attribution on the server", () => {
    expect(designRouter).toContain("featuredStyleId");
    expect(designRouter).toContain("featuredDistributorId");
    expect(designRouter).toContain("affiliateDistributorSelections.featured, true");
  });
});
