import { describe, expect, it } from "vitest";
import {
  catalogNomenclatureIssues,
  canonicalCatalogMasterCode,
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

  it("keeps every AW height in the regular Wall End Cabinet family", () => {
    for (const [masterCode, height, shelves] of [["AW1230", 30, 2], ["AW1236", 36, 2], ["AW1242", 42, 3]] as const) {
      expect(parseCatalogNomenclature(masterCode)).toMatchObject({
        family: "angle-wall",
        expectedCategory: "Wall",
        expectedSubCategory: "Wall End Cabinet",
        expectedPlacement: "wall",
        expectedWidth: 12,
        expectedHeight: height,
        expectedDepth: 12,
      });
      expect(designerFriendlyDescription({ masterCode, numberOfDoors: 1, numberOfAdjShelves: shelves }))
        .toBe(`12" × ${height}" × 12" Angled Wall End Cabinet — 1 Door, ${shelves} Shelves`);
    }
  });

  it("preserves the Capital-specified BEC24 base-end cabinet instead of guessing a 24-inch corner box", () => {
    expect(parseCatalogNomenclature("BEC-24")).toMatchObject({
      family: "base-end-cabinet",
      expectedCategory: "Base",
      expectedSubCategory: "Base End Cabinet",
      expectedPlacement: "base",
      expectedWidth: 30,
      expectedHeight: 34.5,
      expectedDepth: 24,
      expectedDoorCount: 1,
      expectedDrawerCount: 0,
    });
    expect(designerFriendlyDescription({ masterCode: "BEC24" }))
      .toBe('30" × 34.5" × 24" Base End Cabinet — 45° Angled End, 1 Door');
    expect(catalogNomenclatureIssues({
      masterCode: "BEC24",
      description: '30" × 34.5" × 24" Base End Cabinet — 45° Angled End, 1 Door',
      category: "Base",
      subCategory: "Base End Cabinet",
      placementType: "base",
      width: 30,
      height: 34.5,
      depth: 24,
      numberOfDoors: 1,
      numberOfDrawers: 0,
    })).toEqual([]);
  });

  it("preserves the Capital WMS cabinet-kit and individual shelf-insert distinction", () => {
    expect(parseCatalogNomenclature("WMS3018")).toMatchObject({
      family: "wall-microwave-kit",
      expectedCategory: "Wall",
      expectedSubCategory: "Wall Microwave Cabinet Kit",
      expectedWidth: 30,
      expectedHeight: 18,
      expectedDepth: 12,
    });
    expect(designerFriendlyDescription({ masterCode: "WMS3018" }))
      .toBe('30" × 18" × 12" Wall Microwave Cabinet Kit with 26½" × ¾" × 17" Shelf Insert');

    expect(parseCatalogNomenclature("WMSSHELF")).toMatchObject({
      family: "shelf-insert",
      expectedCategory: "Accessory",
      expectedWidth: 26.5,
      expectedHeight: 0.75,
      expectedDepth: 17,
    });
    expect(designerFriendlyDescription({ masterCode: "WMSSHELF" }))
      .toBe('26.5" × 0.75" × 17" Wall Microwave Cabinet Shelf Insert');
  });

  it("normalizes Capital Type A roll-out shelf source facts", () => {
    expect(parseCatalogNomenclature("RS18-Type A")).toMatchObject({
      family: "roll-out-shelf",
      expectedCategory: "Accessory",
      expectedWidth: 13.375,
      expectedHeight: 3.375,
      expectedDepth: 20.4375,
    });
    expect(designerFriendlyDescription({ masterCode: "RS36" }))
      .toBe('31.375" × 3.375" × 20.4375" Roll-Out Shelf, Type A');
  });

  it("preserves the four-door and four-roll-out facts encoded in a utility kit code", () => {
    expect(parseCatalogNomenclature("U2490244RS")).toMatchObject({
      family: "tall",
      expectedCategory: "Tall",
      expectedSubCategory: "Utility Roll-Out Cabinet Kit",
      expectedWidth: 24,
      expectedHeight: 90,
      expectedDepth: 24,
      expectedDoorCount: 4,
      expectedDrawerCount: 0,
      rollOutShelfCount: 4,
    });
    expect(designerFriendlyDescription({ masterCode: "U2490244RS" }))
      .toBe('24" × 90" × 24" Four-Door Utility Cabinet Kit — 4 Roll-Out Shelves');
    expect(catalogNomenclatureIssues({
      masterCode: "U2490244RS",
      description: '24" × 90" × 24" Four-Door Utility Cabinet Kit — 4 Roll-Out Shelves',
      category: "Tall",
      subCategory: "Utility Roll-Out Cabinet Kit",
      placementType: "tall",
      width: 24,
      height: 90,
      depth: 24,
      numberOfDoors: 0,
      numberOfDrawers: 0,
    })).toContain("door-layout-mismatch");
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

  it("treats ADA position as identity-neutral while preserving the ADA cabinet facts", () => {
    expect(canonicalCatalogMasterCode("ADA-B12")).toBe("ADA-B12");
    expect(canonicalCatalogMasterCode("B12ADA")).toBe("ADA-B12");
    expect(canonicalCatalogMasterCode("  3DB15-ADA ")).toBe("ADA-3DB15");

    for (const masterCode of ["ADA-B12", "B12ADA"]) {
      expect(parseCatalogNomenclature(masterCode)).toMatchObject({
        family: "ada",
        canonicalMasterCode: "ADA-B12",
        isAdaAccessible: true,
        adaCoreCode: "B12",
        expectedCategory: "ADA",
        expectedSubCategory: "ADA Base",
        expectedWidth: 12,
        expectedHeight: 32.5,
        expectedDepth: 24,
      });
    }
  });

  it("generates identical designer-friendly ADA descriptions for either code position", () => {
    const facts = {
      width: 12,
      height: 32.5,
      depth: 24,
      numberOfDoors: 1,
      numberOfDrawers: 1,
      numberOfAdjShelves: 1,
    };
    expect(designerFriendlyDescription({ masterCode: "ADA-B12", ...facts }))
      .toBe('12" × 32.5" × 24" ADA Accessible Base Cabinet — 1 Door, 1 Drawer, 1 Shelf');
    expect(designerFriendlyDescription({ masterCode: "B12ADA", ...facts }))
      .toBe(designerFriendlyDescription({ masterCode: "ADA-B12", ...facts }));
    expect(designerFriendlyDescription({
      masterCode: "3DB15ADA",
      width: 15,
      height: 32.5,
      depth: 24,
    })).toBe('15" × 32.5" × 24" ADA Three-Drawer Base Cabinet');
  });
});
