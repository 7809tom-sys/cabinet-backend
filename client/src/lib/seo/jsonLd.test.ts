import { describe, it, expect } from "vitest";
import { buildProductJsonLd, buildPackageJsonLd } from "./jsonLd";

describe("buildProductJsonLd (cabinet)", () => {
  it("emits a valid Product node with brand and sku, no offer", () => {
    const ld = buildProductJsonLd({
      name: "Base Cabinet 12 in. - one door, one shelf",
      description: "One door, one adjustable shelf, soft-close hinges.",
      sku: "B12",
      image: "https://cdn.example.com/b12.png",
      url: "https://cabinet-dealz.com/catalog/B12",
      category: "Base Cabinets",
    });

    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Product");
    expect(ld.name).toContain("Base Cabinet");
    expect(ld.sku).toBe("B12");
    expect(ld.mpn).toBe("B12");
    expect(ld.brand).toEqual({ "@type": "Brand", name: "Cabinet Dealz" });
    // Cabinets must NOT publish tier-gated pricing
    expect(ld.offers).toBeUndefined();
    expect(ld.url).toBe("https://cabinet-dealz.com/catalog/B12");
  });

  it("omits empty/undefined fields", () => {
    const ld = buildProductJsonLd({ name: "Filler Strip", description: "" });
    expect(ld.name).toBe("Filler Strip");
    expect("description" in ld).toBe(false);
    expect("sku" in ld).toBe(false);
    expect("image" in ld).toBe(false);
  });

  it("produces JSON-serializable output", () => {
    const ld = buildProductJsonLd({ name: "Wall Cabinet 30 in." });
    expect(() => JSON.stringify(ld)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(ld));
    expect(parsed["@type"]).toBe("Product");
  });
});

describe("buildPackageJsonLd (kitchen package)", () => {
  it("emits a Product with a public Offer (USD, 2dp, InStock)", () => {
    const ld = buildPackageJsonLd({
      name: "L-Shape 10x10 Kitchen",
      description: "Complete L-shaped kitchen cabinet package.",
      url: "https://cabinet-dealz.com/packages/l-shape-10x10",
      image: "https://cdn.example.com/lshape.png",
      offer: { price: 2499, availability: "InStock" },
    });

    expect(ld["@type"]).toBe("Product");
    expect(ld.category).toBe("Kitchen Cabinet Package");
    const offers = ld.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("Offer");
    expect(offers.price).toBe("2499.00");
    expect(offers.priceCurrency).toBe("USD");
    expect(offers.availability).toBe("https://schema.org/InStock");
    // Offer URL falls back to the product URL
    expect(offers.url).toBe("https://cabinet-dealz.com/packages/l-shape-10x10");
  });

  it("formats fractional prices to two decimals", () => {
    const ld = buildPackageJsonLd({
      name: "U-Shape 10x12",
      offer: { price: 3199.5 },
    });
    const offers = ld.offers as Record<string, unknown>;
    expect(offers.price).toBe("3199.50");
    expect(offers.priceCurrency).toBe("USD"); // default currency
  });

  it("guards non-finite prices by omitting the price field", () => {
    const ld = buildPackageJsonLd({
      name: "Broken",
      offer: { price: Number.NaN },
    });
    const offers = ld.offers as Record<string, unknown>;
    expect("price" in offers).toBe(false);
  });

  it("produces JSON-serializable output", () => {
    const ld = buildPackageJsonLd({
      name: "Galley 10x10",
      offer: { price: 1999 },
    });
    expect(() => JSON.stringify(ld)).not.toThrow();
  });
});
