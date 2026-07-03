import { describe, it, expect } from "vitest";
import {
  categorySlug,
  categoryFromSlug,
  formatPrice,
  surfaceRole,
  PELICAN_STOREFRONT_CATEGORIES,
} from "./pelican";

describe("pelican storefront helpers", () => {
  it("round-trips every storefront category through slug <-> category", () => {
    for (const cat of PELICAN_STOREFRONT_CATEGORIES) {
      const slug = categorySlug(cat);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(categoryFromSlug(slug)).toBe(cat);
    }
  });

  it("maps the quartz slug to the full category name", () => {
    expect(categoryFromSlug("quartz")).toBe("Quartz Slabs (Countertops)");
    expect(categorySlug("Quartz Slabs (Countertops)")).toBe("quartz");
  });

  it("returns null for an unknown slug", () => {
    expect(categoryFromSlug("not-a-real-category")).toBeNull();
  });

  it("formats prices as USD and handles missing price", () => {
    expect(formatPrice(1234.5)).toBe("$1,234.50");
    expect(formatPrice(0)).toBe("$0.00");
    expect(formatPrice(null)).toBe("Call for pricing");
    expect(formatPrice(undefined)).toBe("Call for pricing");
  });
});

describe("surfaceRole (real Pelican storefront categories)", () => {
  it("maps Flooring to flooring", () => {
    expect(surfaceRole({ category: "Flooring", name: "Waterproof LVP Oak" })).toBe("flooring");
  });

  it("maps the parenthesized quartz category to countertop", () => {
    expect(surfaceRole({ category: "Quartz Slabs (Countertops)", name: "Calacatta Gold" })).toBe(
      "countertop"
    );
  });

  it("maps Tile & Mosaic to backsplash", () => {
    expect(surfaceRole({ category: "Tile & Mosaic", name: "Subway White 3x6" })).toBe("backsplash");
  });

  it("splits the combined Sinks & Faucets line by subCategory", () => {
    expect(
      surfaceRole({ category: "Sinks & Faucets", subCategory: "Sinks", name: "Undermount 32in" })
    ).toBe("sink");
    expect(
      surfaceRole({ category: "Sinks & Faucets", subCategory: "Faucets", name: "Pull-down 1H" })
    ).toBe("faucet");
  });

  it("falls back to the product name when subCategory is missing on the combined line", () => {
    expect(surfaceRole({ category: "Sinks & Faucets", name: "Kitchen Faucet Pull-Down" })).toBe(
      "faucet"
    );
    expect(surfaceRole({ category: "Sinks & Faucets", name: "Farmhouse Sink 33in" })).toBe("sink");
  });

  it("treats accessories/disposals in the combined line as neither sink nor faucet", () => {
    expect(
      surfaceRole({
        category: "Sinks & Faucets",
        subCategory: "Sink & Faucet Accessories",
        name: "Basket Strainer",
      })
    ).toBe("other");
    expect(
      surfaceRole({
        category: "Sinks & Faucets",
        subCategory: "Disposals & Accessories",
        name: "3/4 HP Disposal",
      })
    ).toBe("other");
  });

  it("returns other for non-kitchen surface categories and unknowns", () => {
    expect(surfaceRole({ category: "Shower & Bath", name: "Glass Panel" })).toBe("other");
    expect(surfaceRole({ category: "Toilets & Bidets", name: "Smart Bidet" })).toBe("other");
    expect(surfaceRole({ category: "", name: "" })).toBe("other");
    expect(surfaceRole({})).toBe("other");
  });
});
