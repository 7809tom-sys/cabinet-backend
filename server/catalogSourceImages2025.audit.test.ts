import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { cabinets, distributorSkus } from "../drizzle/schema";
import { getDb } from "./db";

const CAPITAL_TRASH_PULL_OUT_ART = "/manus-storage/capital-b18fhtcpo-double-trash-pullout_dfdb17e0.jpg";
const CLARK_SON_WDC_ART = "/manus-storage/clark-son-wdc-opaque-diagonal-wall_2a8c5a25.jpg";
const CLARK_SON_ROLLOUT_ART = "/manus-storage/clark-son-universal-rollout-tray_7eb828ec.jpg";

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
      })
      .from(cabinets)
      .where(inArray(cabinets.masterCode, [
        "BBC-36", "WCA1236", "WCA1242", "WDC2430", "WDC2436", "WDC2442",
        "UNIV-ROT24", "UNIV-ROT27", "UNIV-ROT30", "UNIV-ROT36",
      ]));

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ masterCode: "BBC-36", width: "36.00", height: "34.50", depth: "24.00" }),
      expect.objectContaining({ masterCode: "WCA1236", width: "12.00", height: "36.00", depth: "12.00" }),
      expect.objectContaining({ masterCode: "WCA1242", width: "12.00", height: "42.00", depth: "12.00", numberOfDoors: 1, numberOfDrawers: 0 }),
    ]));

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
});
