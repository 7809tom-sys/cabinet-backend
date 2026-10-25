import { and, eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { cabinets, distributorSkus, skuMasterAliases } from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";

const PREFIX_ALIASES = [
  ["ADA-3DB12", "3DB12ADA"], ["ADA-3DB15", "3DB15ADA"], ["ADA-3DB18", "3DB18ADA"],
  ["ADA-3DB21", "3DB21ADA"], ["ADA-3DB24", "3DB24ADA"], ["ADA-3VDB18", "3VDB18ADA"],
  ["ADA-B21", "B21ADA"], ["ADA-B27", "B27ADA"], ["ADA-B30", "B30ADA"],
  ["ADA-B33", "B33ADA"], ["ADA-BT09", "BT09ADA"], ["ADA-SB33R", "SB33RADA"],
  ["ADA-SB36R", "SB36RADA"], ["ADA-VS24", "VS24ADA"], ["ADA-VS27", "VS27ADA"],
  ["ADA-VS30", "VS30ADA"], ["ADA-VS33", "VS33ADA"], ["ADA-VS33R", "VS33RADA"],
  ["ADA-VS36", "VS36ADA"], ["ADA-VS36R", "VS36RADA"], ["ADA-VSD42", "VSD42ADA"],
  ["ADA-VSD48", "VSD48ADA"],
] as const;

describe("ADA cabinet nomenclature", () => {
  it("uses canonical suffix masters for every publicly visible ADA prefix variant", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    const canonicalCodes = PREFIX_ALIASES.map(([, canonical]) => canonical);
    const canonical = await db
      .select({
        masterCode: cabinets.masterCode,
        isActive: cabinets.isActive,
        showInCatalog: cabinets.showInCatalog,
      })
      .from(cabinets)
      .where(inArray(cabinets.masterCode, canonicalCodes));

    expect(canonical).toHaveLength(canonicalCodes.length);
    expect(canonical.every((record) => record.isActive && record.showInCatalog)).toBe(true);

    const visiblePrefixMasters = await db
      .select({ masterCode: cabinets.masterCode })
      .from(cabinets)
      .where(and(
        eq(cabinets.isActive, true),
        eq(cabinets.showInCatalog, true),
        sql`${cabinets.masterCode} REGEXP '^ADA-'`,
      ));
    expect(visiblePrefixMasters).toEqual([]);
  });

  it("keeps the historic prefix spellings searchable without merging price or color overlays", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    const aliases = await db
      .select({ aliasCode: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode })
      .from(skuMasterAliases)
      .where(and(
        inArray(skuMasterAliases.aliasCode, PREFIX_ALIASES.map(([alias]) => alias)),
        eq(skuMasterAliases.conflictStatus, "ok"),
      ));
    expect(aliases).toEqual(expect.arrayContaining(
      PREFIX_ALIASES.map(([aliasCode, masterCode]) => ({ aliasCode, masterCode })),
    ));

    const sourceRows = await db
      .select({ masterCode: cabinets.masterCode, listPrice: distributorSkus.listPrice, yourCost: distributorSkus.yourCost })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
      .where(and(
        inArray(cabinets.masterCode, ["3DB12ADA", "B21ADA", "VS24ADA", "VSD48ADA"]),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
      ));

    for (const code of ["3DB12ADA", "B21ADA", "VS24ADA", "VSD48ADA"]) {
      expect(sourceRows.some((row) => row.masterCode === code && Math.max(Number(row.listPrice ?? 0), Number(row.yourCost ?? 0)) > 0)).toBe(true);
    }
  });

  it("resolves a historic ADA prefix route to its canonical source-backed master", async () => {
    const caller = appRouter.createCaller({} as any);
    const canonical = await caller.cabinets.byCode({ masterCode: "3DB15ADA" });
    const historic = await caller.cabinets.byCode({ masterCode: "ADA-3DB15" });

    expect(canonical).toEqual(expect.objectContaining({ masterCode: "3DB15ADA", width: "15.00", height: "32.50", depth: "24.00" }));
    expect(historic).toEqual(canonical);
  });
});
