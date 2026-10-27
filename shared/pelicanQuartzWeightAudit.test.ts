import { describe, expect, it } from "vitest";
import { QUARTZ_WEIGHT_DATA_ISSUE, comparePelicanProfileWeights, parseShopifyProductWeights } from "./pelicanQuartzWeightAudit";

describe("Pelican quartz weight comparison", () => {
  it("records the known quartz catalog gap without changing the 600 lb estimate", () => {
    expect(QUARTZ_WEIGHT_DATA_ISSUE).toContain("600");
    expect(QUARTZ_WEIGHT_DATA_ISSUE).toContain("800");
    expect(QUARTZ_WEIGHT_DATA_ISSUE).toContain("1,080");
  });

  it("flags a profile whose weight does not match the Shopify feed", () => {
    const catalog = parseShopifyProductWeights({
      products: [{
        title: "Calacatta Super Jumbo",
        variants: [{ sku: "PL-QZ-1", grams: 1080 * 453.59237, title: "Default Title" }],
      }, {
        title: "Ignored",
        variants: [{ sku: "", grams: 1000 }],
      }],
    });
    const mismatches = comparePelicanProfileWeights([
      { pelicanCode: "PL-QZ-1", name: "Calacatta", category: "Quartz Slabs (Countertops)", weightLbs: 600, evidenceType: "comparable_estimate" },
      { pelicanCode: "PL-QZ-1", name: "Same", category: "Quartz", weightLbs: 1080, evidenceType: "supplier_verified" },
    ], catalog);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].catalogWeightLbs).toBeCloseTo(1080, 0);
    expect(mismatches[0].profileWeightLbs).toBe(600);
  });
});
