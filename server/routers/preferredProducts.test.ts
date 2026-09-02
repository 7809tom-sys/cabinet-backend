import { describe, expect, it } from "vitest";
import { MAX_PREFERRED_PER_CATEGORY, preferredCategoryForProduct } from "./preferredProducts";

describe("Preferred product catalog rules", () => {
  it("accepts only the five customer-selectable product categories", () => {
    expect(preferredCategoryForProduct({ category: "Flooring", subCategory: "Luxury Vinyl Plank" })).toBe("flooring");
    expect(preferredCategoryForProduct({ category: "Quartz Slabs (Countertops)", subCategory: null })).toBe("countertop");
    expect(preferredCategoryForProduct({ category: "Tile & Mosaic", subCategory: "Ceramic Tile" })).toBe("backsplash");
    expect(preferredCategoryForProduct({ category: "Sinks & Faucets", subCategory: "Kitchen Faucet" })).toBe("faucet");
    expect(preferredCategoryForProduct({ category: "Sinks & Faucets", subCategory: "Undermount Sink" })).toBe("sink");
    expect(preferredCategoryForProduct({ category: "Shower & Bath", subCategory: "Tub" })).toBeNull();
    expect(preferredCategoryForProduct({ category: "Sinks & Faucets", subCategory: "Accessory" })).toBeNull();
  });

  it("uses the agreed six-product maximum independently for every category", () => {
    expect(MAX_PREFERRED_PER_CATEGORY).toBe(6);
  });
});
