import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { cabinets, distributorSkus, skuMasterAliases } from "../drizzle/schema";
import { getDb } from "./db";

const CAPITAL_TRASH_PULL_OUT_ART = "/manus-storage/capital-b18fhtcpo-double-trash-pullout_dfdb17e0.jpg";
const CLARK_SON_WDC_ART = "/manus-storage/clark-son-wdc-opaque-diagonal-wall_2a8c5a25.jpg";
const CLARK_SON_ROLLOUT_ART = "/manus-storage/clark-son-universal-rollout-tray_7eb828ec.jpg";
const CLARK_SON_BBC_ART = "/manus-storage/clark-son-bbc36-blind-corner-base_fdab8445.jpg";
const CAPITAL_BEC_ART = "/manus-storage/capital-bec24-base-end-cabinet_eb87e26b.jpg";
const BSD6_SOURCE_ART = "/manus-storage/bsd6-five-drawer-spice-base-dimensioned-sheet_7a806280.png";
const CAPITAL_ADA_SINGLE_DOOR_SINGLE_DRAWER_ART = "/manus-storage/capital-ada-single-door-single-drawer-base_68dcf179.jpg";
const CAPITAL_ADA_DOUBLE_DOOR_SINGLE_DRAWER_ART = "/manus-storage/capital-ada-double-door-single-drawer-base_923182d5.jpg";
const CAPITAL_ADA_DOUBLE_DOOR_DOUBLE_DRAWER_ART = "/manus-storage/capital-ada-double-door-double-drawer-base_fcd5cf87.jpg";
const CAPITAL_ADA_SINGLE_DOOR_ONE_ROLLOUT_ART = "/manus-storage/capital-ada-single-door-single-drawer-1rs-base_10573f98.jpg";
const CAPITAL_ADA_SINGLE_DOOR_TWO_ROLLOUT_ART = "/manus-storage/capital-ada-single-door-single-drawer-2rs-base_fa6fcdbe.jpg";
const CAPITAL_ADA_DOUBLE_DOOR_ONE_ROLLOUT_ART = "/manus-storage/capital-ada-double-door-single-drawer-1rs-base_e41cb4b0.jpg";
const CAPITAL_ADA_DOUBLE_DOOR_TWO_ROLLOUT_ART = "/manus-storage/capital-ada-double-door-single-drawer-2rs-base_9d71051b.jpg";
const CAPITAL_ADA_DOUBLE_DRAWER_ONE_ROLLOUT_ART = "/manus-storage/capital-ada-double-door-double-drawer-1rs-base_d97419b1.jpg";
const CAPITAL_ADA_DOUBLE_DRAWER_TWO_ROLLOUT_ART = "/manus-storage/capital-ada-double-door-double-drawer-2rs-base_2a00c0eb.jpg";
const CAPITAL_ADA_SINK_ART = "/manus-storage/capital-ada-sink-base_cf68d413.jpg";
const CAPITAL_ADA_EASY_REACH_ART = "/manus-storage/capital-ada-easy-reach-base_0080ee84.jpg";
const CAPITAL_ADA_LAZY_SUSAN_ART = "/manus-storage/capital-ada-lazy-susan-easy-reach-base_712328cc.jpg";

describe("catalog-source generic image audit", () => {
  it("uses the supplied Capital source drawing for the B18 double-trash pullout", async () => {
    const db = await getDb();
    if (!db) return;

    const [item] = await db
      .select({
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        category: cabinets.category,
        subCategory: cabinets.subCategory,
        width: cabinets.width,
        height: cabinets.height,
        depth: cabinets.depth,
        numberOfDoors: cabinets.numberOfDoors,
        numberOfDrawers: cabinets.numberOfDrawers,
        catalogImageUrl: cabinets.catalogImageUrl,
        specImageUrl: cabinets.specImageUrl,
        specNotes: cabinets.specNotes,
      })
      .from(cabinets)
      .where(eq(cabinets.masterCode, "B18FHTCPO"));

    expect(item).toEqual(expect.objectContaining({
      masterCode: "B18FHTCPO",
      description: '18" Full Height Door Base Kit with Double Trash Can Pullout',
      category: "Base",
      subCategory: "Trash Can Pullout Base",
      width: "18.00",
      height: "34.50",
      depth: "24.00",
      numberOfDoors: 1,
      numberOfDrawers: 0,
      catalogImageUrl: CAPITAL_TRASH_PULL_OUT_ART,
      specImageUrl: CAPITAL_TRASH_PULL_OUT_ART,
    }));
    expect(item?.specNotes).toContain("double trash-can pullout");
    expect(item?.specNotes).toContain("two 35-qt trash cans");

    const sourceRows = await db
      .select({ listPrice: distributorSkus.listPrice, isAvailable: distributorSkus.isAvailable, isPublished: distributorSkus.isPublished })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
      .where(eq(cabinets.masterCode, "B18FHTCPO"));

    expect(sourceRows.length).toBeGreaterThan(0);
    for (const row of sourceRows) {
      expect(Number(row.listPrice)).toBeGreaterThan(0);
      expect(row.isAvailable).toBe(true);
      expect(row.isPublished).toBe(true);
    }
  });

  it("keeps Clark and Son source geometry and catalog-only generic images aligned", async () => {
    const db = await getDb();
    if (!db) return;

    const records = await db
      .select({
        masterCode: cabinets.masterCode,
        width: cabinets.width,
        height: cabinets.height,
        depth: cabinets.depth,
        numberOfDoors: cabinets.numberOfDoors,
        numberOfDrawers: cabinets.numberOfDrawers,
        catalogImageUrl: cabinets.catalogImageUrl,
        specImageUrl: cabinets.specImageUrl,
        specNotes: cabinets.specNotes,
      })
      .from(cabinets)
      .where(inArray(cabinets.masterCode, [
        "BBC-36", "WCA1236", "WCA1242", "WDC2430", "WDC2436", "WDC2442",
        "UNIV-ROT24", "UNIV-ROT27", "UNIV-ROT30", "UNIV-ROT36",
      ]));

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        masterCode: "BBC-36",
        width: "36.00",
        height: "34.50",
        depth: "24.00",
        numberOfDoors: 1,
        numberOfDrawers: 1,
        catalogImageUrl: CLARK_SON_BBC_ART,
        specImageUrl: CLARK_SON_BBC_ART,
      }),
      expect.objectContaining({ masterCode: "WCA1236", width: "12.00", height: "36.00", depth: "12.00" }),
      expect.objectContaining({ masterCode: "WCA1242", width: "12.00", height: "42.00", depth: "12.00", numberOfDoors: 1, numberOfDrawers: 0 }),
    ]));
    expect(records.find((record) => record.masterCode === "BBC-36")?.specNotes).toContain("36 W × 34½ H × 24 D");
    expect(records.find((record) => record.masterCode === "BBC-36")?.specNotes).toContain("3–6 inch blind-pull rule");

    for (const code of ["WDC2430", "WDC2436", "WDC2442"]) {
      expect(records).toEqual(expect.arrayContaining([
        expect.objectContaining({ masterCode: code, width: "24.00", depth: "12.00", catalogImageUrl: CLARK_SON_WDC_ART }),
      ]));
    }
    for (const code of ["UNIV-ROT24", "UNIV-ROT27", "UNIV-ROT30", "UNIV-ROT36"]) {
      expect(records).toEqual(expect.arrayContaining([
        expect.objectContaining({ masterCode: code, catalogImageUrl: CLARK_SON_ROLLOUT_ART }),
      ]));
    }
  });

  it("uses the supplied Capital base-end drawing for BEC-24 without changing its verified plan dimensions", async () => {
    const db = await getDb();
    if (!db) return;

    const [bec] = await db
      .select({
        masterCode: cabinets.masterCode,
        width: cabinets.width,
        height: cabinets.height,
        depth: cabinets.depth,
        numberOfDoors: cabinets.numberOfDoors,
        numberOfDrawers: cabinets.numberOfDrawers,
        catalogImageUrl: cabinets.catalogImageUrl,
        specImageUrl: cabinets.specImageUrl,
        specNotes: cabinets.specNotes,
      })
      .from(cabinets)
      .where(eq(cabinets.masterCode, "BEC-24"));

    expect(bec).toEqual(expect.objectContaining({
      masterCode: "BEC-24",
      width: "24.00",
      height: "34.50",
      depth: "24.00",
      numberOfDoors: 2,
      numberOfDrawers: 0,
      catalogImageUrl: CAPITAL_BEC_ART,
      specImageUrl: CAPITAL_BEC_ART,
    }));
    expect(bec?.specNotes).toContain("open angled shelf bridge");
  });

  it("uses the owner-supplied BSD6 product sheet and keeps BSDC6 as a supplier alias", async () => {
    const db = await getDb();
    if (!db) return;

    const [spice] = await db
      .select({
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        width: cabinets.width,
        height: cabinets.height,
        depth: cabinets.depth,
        numberOfDoors: cabinets.numberOfDoors,
        numberOfDrawers: cabinets.numberOfDrawers,
        catalogImageUrl: cabinets.catalogImageUrl,
        specImageUrl: cabinets.specImageUrl,
        specNotes: cabinets.specNotes,
      })
      .from(cabinets)
      .where(eq(cabinets.masterCode, "BSD6"));

    expect(spice).toEqual(expect.objectContaining({
      masterCode: "BSD6",
      description: "6 in. Base Spice Drawers Cabinet — 5 drawers",
      width: "6.00",
      height: "34.50",
      depth: "24.00",
      numberOfDoors: 0,
      numberOfDrawers: 5,
      catalogImageUrl: BSD6_SOURCE_ART,
      specImageUrl: BSD6_SOURCE_ART,
    }));
    expect(spice?.specNotes).toContain("Drawer slides are not included");
    expect(spice?.specNotes).toContain("used as a wine rack");

    const [alias] = await db
      .select({ aliasCode: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode })
      .from(skuMasterAliases)
      .where(eq(skuMasterAliases.aliasCode, "BSDC6"));
    expect(alias).toEqual({ aliasCode: "BSDC6", masterCode: "BSD6" });

    const overlays = await db
      .select({
        listPrice: distributorSkus.listPrice,
        adjustedListPrice: distributorSkus.adjustedListPrice,
        homeownerPrice: distributorSkus.homeownerPrice,
        yourCost: distributorSkus.yourCost,
        isAvailable: distributorSkus.isAvailable,
        isPublished: distributorSkus.isPublished,
      })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
      .where(eq(cabinets.masterCode, "BSD6"));

    for (const overlay of overlays.filter((row) => row.isAvailable && row.isPublished)) {
      expect(Math.max(
        Number(overlay.listPrice ?? 0),
        Number(overlay.adjustedListPrice ?? 0),
        Number(overlay.homeownerPrice ?? 0),
        Number(overlay.yourCost ?? 0),
      )).toBeGreaterThan(0);
    }
  });

  it("uses U.S. Cabinet Depot V8 truth for ADA base configurations and source drawings", async () => {
    const db = await getDb();
    if (!db) return;

    const codes = [
      "B12ADA", "B15ADA", "B18ADA", "B18ADA1RS", "B18ADA2RS", "B24ADA", "B24ADA1RS", "B24ADA2RS",
      "B30SADA", "B30SADA1RS", "B30SADA2RS", "B36ADA", "B36ADA1RS", "B36ADA2RS",
    ];
    const records = await db
      .select({
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        category: cabinets.category,
        subCategory: cabinets.subCategory,
        width: cabinets.width,
        height: cabinets.height,
        depth: cabinets.depth,
        numberOfDoors: cabinets.numberOfDoors,
        numberOfDrawers: cabinets.numberOfDrawers,
        numberOfAdjShelves: cabinets.numberOfAdjShelves,
        graphicType: cabinets.graphicType,
        catalogImageUrl: cabinets.catalogImageUrl,
        specImageUrl: cabinets.specImageUrl,
        specNotes: cabinets.specNotes,
        configVerified: cabinets.configVerified,
      })
      .from(cabinets)
      .where(inArray(cabinets.masterCode, codes));

    expect(records).toHaveLength(codes.length);
    const byCode = new Map(records.map((record) => [record.masterCode, record]));

    const sourceTruth = [
      ["B12ADA", 12, 1, 1, CAPITAL_ADA_SINGLE_DOOR_SINGLE_DRAWER_ART, "12 in. ADA Base Cabinet — 1 Door, 1 Drawer"],
      ["B15ADA", 15, 1, 1, CAPITAL_ADA_SINGLE_DOOR_SINGLE_DRAWER_ART, "15 in. ADA Base Cabinet — 1 Door, 1 Drawer"],
      ["B18ADA", 18, 1, 1, CAPITAL_ADA_SINGLE_DOOR_SINGLE_DRAWER_ART, "18 in. ADA Base Cabinet — 1 Door, 1 Drawer"],
      ["B24ADA", 24, 2, 1, CAPITAL_ADA_DOUBLE_DOOR_SINGLE_DRAWER_ART, "24 in. ADA Base Cabinet — 2 Doors, 1 Drawer"],
      ["B30SADA", 30, 2, 1, CAPITAL_ADA_DOUBLE_DOOR_SINGLE_DRAWER_ART, "30 in. ADA Base Cabinet — 2 Doors, 1 Drawer"],
      ["B36ADA", 36, 2, 2, CAPITAL_ADA_DOUBLE_DOOR_DOUBLE_DRAWER_ART, "36 in. ADA Base Cabinet — 2 Doors, 2 Drawers"],
      ["B18ADA1RS", 18, 1, 1, CAPITAL_ADA_SINGLE_DOOR_ONE_ROLLOUT_ART, "18 in. ADA Base Cabinet — 1 Door, 1 Drawer, 1 Roll-Out Shelf"],
      ["B18ADA2RS", 18, 1, 1, CAPITAL_ADA_SINGLE_DOOR_TWO_ROLLOUT_ART, "18 in. ADA Base Cabinet — 1 Door, 1 Drawer, 2 Roll-Out Shelves"],
      ["B24ADA1RS", 24, 2, 1, CAPITAL_ADA_DOUBLE_DOOR_ONE_ROLLOUT_ART, "24 in. ADA Base Cabinet — 2 Doors, 1 Drawer, 1 Roll-Out Shelf"],
      ["B24ADA2RS", 24, 2, 1, CAPITAL_ADA_DOUBLE_DOOR_TWO_ROLLOUT_ART, "24 in. ADA Base Cabinet — 2 Doors, 1 Drawer, 2 Roll-Out Shelves"],
      ["B30SADA1RS", 30, 2, 1, CAPITAL_ADA_DOUBLE_DOOR_ONE_ROLLOUT_ART, "30 in. ADA Base Cabinet — 2 Doors, 1 Drawer, 1 Roll-Out Shelf"],
      ["B30SADA2RS", 30, 2, 1, CAPITAL_ADA_DOUBLE_DOOR_TWO_ROLLOUT_ART, "30 in. ADA Base Cabinet — 2 Doors, 1 Drawer, 2 Roll-Out Shelves"],
      ["B36ADA1RS", 36, 2, 2, CAPITAL_ADA_DOUBLE_DRAWER_ONE_ROLLOUT_ART, "36 in. ADA Base Cabinet — 2 Doors, 2 Drawers, 1 Roll-Out Shelf"],
      ["B36ADA2RS", 36, 2, 2, CAPITAL_ADA_DOUBLE_DRAWER_TWO_ROLLOUT_ART, "36 in. ADA Base Cabinet — 2 Doors, 2 Drawers, 2 Roll-Out Shelves"],
    ] as const;

    for (const [code, width, doors, drawers, art, description] of sourceTruth) {
      expect(byCode.get(code)).toEqual(expect.objectContaining({
        masterCode: code,
        description,
        category: "ADA",
        subCategory: "ADA Base",
        width: `${width}.00`,
        height: "32.50",
        depth: "24.00",
        numberOfDoors: doors,
        numberOfDrawers: drawers,
        numberOfAdjShelves: 0,
        configVerified: true,
        catalogImageUrl: art,
        specImageUrl: art,
      }));
      expect(byCode.get(code)?.specNotes).toContain("U.S. Cabinet Depot V8 structural source");
      expect(byCode.get(code)?.specNotes).toContain("price and color availability remain distributor-specific overlays");
    }

    expect(byCode.get("B24ADA1RS")?.specNotes).toContain("1 floor-mounted roll-out shelf");
    expect(byCode.get("B24ADA2RS")?.specNotes).toContain("2 floor-mounted roll-out shelves");

    const aliases = await db
      .select({ masterCode: skuMasterAliases.masterCode, alias: skuMasterAliases.aliasCode })
      .from(skuMasterAliases)
      .where(inArray(skuMasterAliases.aliasCode, ["ADA-B12", "ADA-B15", "ADA-B18", "ADA-B24", "ADA-B36"]));
    expect(aliases).toHaveLength(5);
    const expectedAliases = new Map([
      ["ADA-B12", "B12ADA"], ["ADA-B15", "B15ADA"], ["ADA-B18", "B18ADA"], ["ADA-B24", "B24ADA"], ["ADA-B36", "B36ADA"],
    ]);
    for (const alias of aliases) expect(alias.masterCode).toBe(expectedAliases.get(alias.alias));
  });

  it("keeps U.S. Cabinet Depot ADA sink and corner bases code-true and distinct", async () => {
    const db = await getDb();
    if (!db) return;

    const records = await db
      .select({
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        category: cabinets.category,
        subCategory: cabinets.subCategory,
        width: cabinets.width,
        height: cabinets.height,
        depth: cabinets.depth,
        numberOfDoors: cabinets.numberOfDoors,
        numberOfDrawers: cabinets.numberOfDrawers,
        numberOfAdjShelves: cabinets.numberOfAdjShelves,
        isCornerCabinet: cabinets.isCornerCabinet,
        cornerType: cabinets.cornerType,
        openingWidth: cabinets.openingWidth,
        shelfCount: cabinets.shelfCount,
        catalogImageUrl: cabinets.catalogImageUrl,
        specImageUrl: cabinets.specImageUrl,
        specNotes: cabinets.specNotes,
        configVerified: cabinets.configVerified,
      })
      .from(cabinets)
      .where(inArray(cabinets.masterCode, ["SB30SADA", "SB36ADA", "BER36ADA", "LSB36ADA"]));

    expect(records).toHaveLength(4);
    const byCode = new Map(records.map((record) => [record.masterCode, record]));
    for (const code of ["SB30SADA", "SB36ADA"]) {
      expect(byCode.get(code)).toEqual(expect.objectContaining({
        category: "ADA",
        subCategory: "ADA Sink Base",
        height: "32.50",
        depth: "24.00",
        numberOfDoors: 2,
        numberOfDrawers: 0,
        numberOfAdjShelves: 0,
        catalogImageUrl: CAPITAL_ADA_SINK_ART,
        specImageUrl: CAPITAL_ADA_SINK_ART,
        configVerified: true,
      }));
      expect(byCode.get(code)?.description).toContain("Single Slab False Drawer Front");
    }

    expect(byCode.get("BER36ADA")).toEqual(expect.objectContaining({
      description: "36 in. ADA Easy Reach Corner Base — 2 Doors",
      category: "ADA",
      subCategory: "Easy Reach Corner Base",
      width: "36.00",
      height: "32.50",
      depth: "24.00",
      numberOfDoors: 2,
      isCornerCabinet: true,
      cornerType: "l-shape",
      openingWidth: "15.50",
      catalogImageUrl: CAPITAL_ADA_EASY_REACH_ART,
      specImageUrl: CAPITAL_ADA_EASY_REACH_ART,
      configVerified: true,
    }));

    expect(byCode.get("LSB36ADA")).toEqual(expect.objectContaining({
      description: "36 in. ADA Easy Reach Corner Base with Lazy Susan Trays — 2 Doors",
      category: "ADA",
      subCategory: "Lazy Susan / Easy Reach",
      width: "36.00",
      height: "32.50",
      depth: "24.00",
      numberOfDoors: 2,
      isCornerCabinet: true,
      cornerType: "l-shape",
      openingWidth: "15.50",
      shelfCount: 2,
      catalogImageUrl: CAPITAL_ADA_LAZY_SUSAN_ART,
      specImageUrl: CAPITAL_ADA_LAZY_SUSAN_ART,
      configVerified: true,
    }));
    expect(byCode.get("BER36ADA")?.specNotes).toContain("15 1/2-inch inside opening");
    expect(byCode.get("LSB36ADA")?.specNotes).toContain("Lazy Susan trays");
  });
});
