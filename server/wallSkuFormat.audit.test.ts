import { and, eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { cabinets, distributorSkus, skuMasterAliases } from "../drizzle/schema";
import { getDb } from "./db";
import { resolveCanonicalCatalogSources } from "./lib/canonicalCatalogSources";

describe("standard wall cabinet nomenclature", () => {
  it("uses W-1836 as the one public master while preserving W1836 and W-18-36 as source aliases", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    const masters = await db
      .select({
        id: cabinets.id,
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        width: cabinets.width,
        height: cabinets.height,
        depth: cabinets.depth,
        numberOfDoors: cabinets.numberOfDoors,
        numberOfDrawers: cabinets.numberOfDrawers,
        isActive: cabinets.isActive,
        showInCatalog: cabinets.showInCatalog,
      })
      .from(cabinets)
      .where(inArray(cabinets.masterCode, ["W-1836", "W1836", "W-18-36"]));

    const canonical = masters.find((row) => row.masterCode === "W-1836");
    const retiredFormat = masters.find((row) => row.masterCode === "W-18-36");
    expect(canonical).toMatchObject({
      description: '18" × 36" × 12" Wall Cabinet — 1 Door, 2 Adjustable Shelves',
      width: "18.00",
      height: "36.00",
      depth: "12.00",
      numberOfDoors: 1,
      numberOfDrawers: 0,
      isActive: true,
      showInCatalog: true,
    });
    expect(retiredFormat).toMatchObject({ isActive: false, showInCatalog: false });

    const aliases = await db
      .select({ aliasCode: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode })
      .from(skuMasterAliases)
      .where(and(
        inArray(skuMasterAliases.aliasCode, ["W1836", "W-18-36"]),
        eq(skuMasterAliases.conflictStatus, "ok"),
      ));
    expect(aliases).toEqual(expect.arrayContaining([
      { aliasCode: "W1836", masterCode: "W-1836" },
      { aliasCode: "W-18-36", masterCode: "W-1836" },
    ]));

    const sourceRows = await db
      .select({ sourceMasterCode: cabinets.masterCode, listPrice: distributorSkus.listPrice })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
      .where(and(
        eq(cabinets.masterCode, "W-18-36"),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
      ));
    expect(sourceRows.length).toBeGreaterThan(0);
    expect(sourceRows.every((row) => Number(row.listPrice ?? 0) > 0)).toBe(true);

    const projected = resolveCanonicalCatalogSources(
      sourceRows,
      aliases,
      canonical ? [canonical] : [],
    );
    expect(projected).toHaveLength(sourceRows.length);
    expect(projected.every(({ master }) => master.masterCode === "W-1836")).toBe(true);
  });

  it("uses the W-0936-style code format for every visible standard solid wall cabinet", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    const visibleStandardWalls = await db
      .select({ masterCode: cabinets.masterCode, description: cabinets.description })
      .from(cabinets)
      .where(and(
        eq(cabinets.category, "Wall"),
        eq(cabinets.isActive, true),
        eq(cabinets.showInCatalog, true),
        // Numeric, solid-wall model codes only. Glass, corner, appliance, and
        // other specialty models retain their source-specific nomenclature.
        sql`${cabinets.masterCode} REGEXP '^W[- ]?[0-9]{1,2}[- ]?[0-9]{2}$'`,
      ));

    expect(visibleStandardWalls.length).toBeGreaterThan(35);
    expect(visibleStandardWalls.every(({ masterCode }) => /^W-\d{4}$/.test(masterCode))).toBe(true);
    expect(visibleStandardWalls.some(({ masterCode }) => /^W-\d{2}-\d{2}$/.test(masterCode))).toBe(false);
    expect(visibleStandardWalls.some(({ masterCode }) => /^W\d{4}$/.test(masterCode))).toBe(false);
  });
});
