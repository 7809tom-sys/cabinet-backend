import { describe, it, expect } from "vitest";
import { buildProductJsonLd } from "./jsonLd";

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
