import { describe, expect, it } from "vitest";
import {
  catalogNomenclatureIssues,
  designerFriendlyDescription,
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

  it("rejects a WSV vanity identity while allowing the code-drawn structural art fallback", () => {
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
    ]));
  });

  it("accepts a code-true WSV-24 record without a stored thumbnail", () => {
    expect(catalogNomenclatureIssues({
      masterCode: "WSV-24",
      description: 'Wall Skin / Scribe Veneer Panel — 15"W x 24"H x 1/4"D',
      category: "Wall Skin / Scribe Veneer",
      subCategory: "Wall Skin / Scribe Veneer",
      placementType: "accessory",
      width: 15,
      height: 24,
      depth: 0.25,
      catalogImageUrl: null,
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

  it("parses the restored specialty families from their unambiguous codes", () => {
    expect(parseCatalogNomenclature("DCW2436")).toMatchObject({
      family: "diagonal-corner-wall",
      expectedCategory: "Wall",
      expectedWidth: 24,
      expectedHeight: 36,
      expectedDepth: 12,
    });
    expect(parseCatalogNomenclature("WBC2736")).toMatchObject({
      family: "wall-blind-corner",
      expectedCategory: "Wall",
      expectedWidth: 27,
      expectedHeight: 36,
      expectedDepth: 12,
    });
    expect(parseCatalogNomenclature("CHROME TRAY 33")).toMatchObject({
      family: "chrome-tray",
      expectedCategory: "Accessory",
      expectedSubCategory: "Lazy Susan Insert",
    });
  });

  it("builds clean code-true descriptions without distributor or finish wording", () => {
    expect(designerFriendlyDescription({
      masterCode: "DCW2436",
      numberOfDoors: 1,
      numberOfAdjShelves: 2,
    })).toBe('24" × 36" × 12" Diagonal Corner Wall Cabinet — 1 Door, 2 Shelves');

    expect(designerFriendlyDescription({
      masterCode: "U189024",
      numberOfDoors: 2,
      numberOfAdjShelves: 5,
    })).toBe('18" × 90" × 24" Tall Pantry Cabinet — 2 Doors, 5 Shelves');

    expect(designerFriendlyDescription({ masterCode: "CHROME TRAY 36" }))
      .toBe("Chrome Tray Insert for ERB36 Easy-Reach Corner Cabinet");
  });

  it("distinguishes full-height roll-out bases from regular drawer bases", () => {
    expect(parseCatalogNomenclature("B18FH2RS")).toMatchObject({
      family: "base",
      expectedWidth: 18,
      isFullHeightBase: true,
      expectedDrawerCount: 0,
      rollOutShelfCount: 2,
    });
    expect(designerFriendlyDescription({
      masterCode: "B18FH2RS",
      width: 18,
      height: 34.5,
      depth: 24,
    })).toBe('18" × 34.5" × 24" Full-Height Base Cabinet — No Drawer, 2 Roll-Out Shelves');

    expect(parseCatalogNomenclature("B121RS")).toMatchObject({
      family: "base",
      expectedWidth: 12,
      isFullHeightBase: false,
      expectedDrawerCount: 1,
      rollOutShelfCount: 1,
    });
    expect(designerFriendlyDescription({
      masterCode: "B121RS",
      width: 12,
      height: 34.5,
      depth: 24,
    })).toBe('12" × 34.5" × 24" Base Cabinet — 1 Drawer, 1 Roll-Out Shelf');
  });

  it("flags an imported drawer count that conflicts with a full-height #RS code", () => {
    expect(catalogNomenclatureIssues({
      masterCode: "B18FH2RS",
      description: '18" × 34.5" × 24" Full-Height Base Cabinet — No Drawer, 2 Roll-Out Shelves',
      category: "Base",
      subCategory: "Full Height",
      placementType: "base",
      width: 18,
      numberOfDrawers: 1,
    })).toContain("drawer-layout-mismatch");
  });
});
