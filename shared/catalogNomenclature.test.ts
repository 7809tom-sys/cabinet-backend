import { describe, expect, it } from "vitest";
import {
  catalogNomenclatureIssues,
  hasPositiveCatalogPrice,
  parseCatalogNomenclature,
} from "./catalogNomenclature";

describe("catalog nomenclature truth", () => {
  it("parses WSV product-family dimensions from the code", () => {
    expect(parseCatalogNomenclature("WSV-24")).toMatchObject({
      family: "wall-skin-veneer",
      expectedCategory: "Wall Skin / Scribe Veneer",
      expectedWidth: 15,
      expectedHeight: 24,
      expectedDepth: 0.25,
    });
  });

  it("rejects a WSV vanity identity and missing structural art", () => {
    const issues = catalogNomenclatureIssues({
      masterCode: "WSV-24",
      description: "24 inch Vanity Base",
      category: "Vanity",
      subCategory: "Base Cabinet",
      placementType: "base",
      width: 24,
      height: 34.5,
      depth: 21,
      catalogImageUrl: null,
    });
    expect(issues).toEqual(expect.arrayContaining([
      "description-mismatch",
      "category-mismatch",
      "subcategory-mismatch",
      "placement-mismatch",
      "width-mismatch",
      "height-mismatch",
      "depth-mismatch",
      "generic-image-required",
    ]));
  });

  it("accepts a code-true WSV-24 library record", () => {
    expect(catalogNomenclatureIssues({
      masterCode: "WSV-24",
      description: 'Wall Skin / Scribe Veneer Panel — 15"W x 24"H x 1/4"D',
      category: "Wall Skin / Scribe Veneer",
      subCategory: "Wall Skin / Scribe Veneer",
      placementType: "accessory",
      width: 15,
      height: 24,
      depth: 0.25,
      catalogImageUrl: "/manus-storage/wsv-24-library-line-art_bfd76a50.png",
    })).toEqual([]);
  });

  it("parses B15 and OC2496 without distributor naming assumptions", () => {
    expect(parseCatalogNomenclature("B15")).toMatchObject({
      family: "base",
      expectedCategory: "Base",
      expectedPlacement: "base",
      expectedWidth: 15,
    });
    expect(parseCatalogNomenclature("OC2496")).toMatchObject({
      family: "tall",
      expectedCategory: "Tall",
      expectedPlacement: "tall",
      expectedWidth: 24,
      expectedHeight: 96,
    });
  });

  it("never treats zero as an eligible customer-facing price", () => {
    expect(hasPositiveCatalogPrice([0, "0.00", null])).toBe(false);
    expect(hasPositiveCatalogPrice([0, "8.75"])).toBe(true);
  });
});
