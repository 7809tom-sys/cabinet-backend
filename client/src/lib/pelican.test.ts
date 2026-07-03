import { describe, it, expect } from "vitest";
import {
  categorySlug,
  categoryFromSlug,
  formatPrice,
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
