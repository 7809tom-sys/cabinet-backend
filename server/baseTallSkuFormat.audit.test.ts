import { and, eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { cabinets, distributorSkus, skuMasterAliases } from "../drizzle/schema";
import { getDb } from "./db";
import { resolveCanonicalCatalogSources } from "./lib/canonicalCatalogSources";

describe("base and tall cabinet nomenclature", () => {
  it("uses one public canonical master for standard base and utility pantry codes while preserving legacy forms as aliases", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    const expectedMasters = ["B12", "B24", "2DB24", "3DB24", "FSB36", "SB36", "U188424", "U189024", "U248424", "U249024", "U249624"];
    const masters = await db
      .select({
        id: cabinets.id,
        masterCode: cabinets.masterCode,
        isActive: cabinets.isActive,
        showInCatalog: cabinets.showInCatalog,
      })
      .from(cabinets)
      .where(inArray(cabinets.masterCode, expectedMasters));

    expect(masters).toHaveLength(expectedMasters.length);
    expect(masters.every(({ isActive, showInCatalog }) => isActive && showInCatalog)).toBe(true);

    const aliases = await db
      .select({ aliasCode: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode })
      .from(skuMasterAliases)
      .where(and(
        inArray(skuMasterAliases.aliasCode, [
          "B-12", "B-24", "2-DB24", "3-DB24", "FSB-36", "SB-36",
          "U-18-84-24", "U-18-90-24", "U-24-84-24", "U-24-90-24", "U-24-96-24",
        ]),
        eq(skuMasterAliases.conflictStatus, "ok"),
      ));
    expect(aliases).toEqual(expect.arrayContaining([
      { aliasCode: "B-12", masterCode: "B12" },
      { aliasCode: "B-24", masterCode: "B24" },
      { aliasCode: "2-DB24", masterCode: "2DB24" },
      { aliasCode: "3-DB24", masterCode: "3DB24" },
      { aliasCode: "FSB-36", masterCode: "FSB36" },
      { aliasCode: "SB-36", masterCode: "SB36" },
      { aliasCode: "U-18-84-24", masterCode: "U188424" },
      { aliasCode: "U-18-90-24", masterCode: "U189024" },
      { aliasCode: "U-24-84-24", masterCode: "U248424" },
      { aliasCode: "U-24-90-24", masterCode: "U249024" },
      { aliasCode: "U-24-96-24", masterCode: "U249624" },
    ]));
  });

  it("keeps source-backed vendor pricing on the canonical 3DB24 and utility pantry masters", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    const sources = await db
      .select({
        sourceMasterCode: cabinets.masterCode,
        distributorSku: distributorSkus.distributorSku,
        listPrice: distributorSkus.listPrice,
        yourCost: distributorSkus.yourCost,
        isAvailable: distributorSkus.isAvailable,
        isPublished: distributorSkus.isPublished,
        status: distributorSkus.status,
      })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
      .where(and(
        inArray(cabinets.masterCode, ["3DB24", "U189024", "U248424", "U249024", "U249624"]),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
        eq(distributorSkus.status, "approved"),
      ));

    expect(sources.some(({ sourceMasterCode, distributorSku, listPrice, yourCost }) =>
      sourceMasterCode === "3DB24" && distributorSku === "ASP-DB24" && Number(listPrice) > 0 && Number(yourCost) > 0,
    )).toBe(true);
    for (const code of ["U189024", "U248424", "U249024", "U249624"]) {
      expect(sources.some(({ sourceMasterCode, distributorSku, listPrice, yourCost }) =>
        sourceMasterCode === code && distributorSku.startsWith("GR-U") && Number(listPrice) > 0 && Number(yourCost) > 0,
      )).toBe(true);
    }

    const aliases = await db
      .select({ aliasCode: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode })
      .from(skuMasterAliases)
      .where(and(
        inArray(skuMasterAliases.aliasCode, ["3-DB24", "U-18-90-24", "U-24-84-24", "U-24-90-24", "U-24-96-24"]),
        eq(skuMasterAliases.conflictStatus, "ok"),
      ));
    const canonicalRows = await db
      .select({ id: cabinets.id, masterCode: cabinets.masterCode })
      .from(cabinets)
      .where(inArray(cabinets.masterCode, ["3DB24", "U189024", "U248424", "U249024", "U249624"]));
    const projected = resolveCanonicalCatalogSources(sources, aliases, canonicalRows);
    expect(projected).toHaveLength(sources.length);
    expect(projected.every(({ master }) => ["3DB24", "U189024", "U248424", "U249024", "U249624"].includes(master.masterCode))).toBe(true);
  });

  it("does not publish dashed standard base or utility-pantry code variants", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    const legacyForms = await db
      .select({ masterCode: cabinets.masterCode })
      .from(cabinets)
      .where(and(
        eq(cabinets.isActive, true),
        eq(cabinets.showInCatalog, true),
        sql`${cabinets.masterCode} REGEXP '^(2|3)-DB[0-9]+$|^B-[0-9]+$|^SB-[0-9]+$|^FSB-[0-9]+$|^U-[0-9]{2}-[0-9]{2}-[0-9]{2}$'`,
      ));

    expect(legacyForms).toEqual([]);
  });
});
