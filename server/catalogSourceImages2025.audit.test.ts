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
});
