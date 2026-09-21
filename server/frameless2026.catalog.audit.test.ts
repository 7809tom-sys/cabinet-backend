import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { cabinets, distributorSkus, doorStyles, skuMasterAliases } from "../drizzle/schema";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";

const SKYLINE = 180001;
const FRAMLESS_STYLE_CODES = ["MI", "MB", "OB", "OS", "HW", "HG", "CG", "MG"] as const;

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("Milestone Frameless Spec Book 2026 catalog audit", () => {
  it("retains the source-backed frameless construction and glass-wall scope", async () => {
    const db = await getDb();
    if (!db) return;

    const styles = await db
      .select({
        styleCode: doorStyles.styleCode,
        doorStyle: doorStyles.doorStyle,
        boxConstruction: doorStyles.boxConstruction,
        drawerConstruction: doorStyles.drawerConstruction,
        hardware: doorStyles.hardware,
        sourceSpecification: doorStyles.sourceSpecification,
        specificationStatus: doorStyles.specificationStatus,
        isActive: doorStyles.isActive,
      })
      .from(doorStyles)
      .where(and(
        eq(doorStyles.distributorId, SKYLINE),
        inArray(doorStyles.styleCode, [...FRAMLESS_STYLE_CODES]),
      ));

    expect(styles).toHaveLength(8);
    for (const style of styles) {
      expect(style.isActive).toBe(true);
      expect(style.specificationStatus).toBe("purchasable");
      expect(style.boxConstruction).toContain("3/4-inch plywood");
      expect(style.drawerConstruction).toContain("DTC concealed undermount");
      expect(style.sourceSpecification).toContain("Milestone Frameless Spec Book 2026");
    }
    for (const style of styles.filter((item) => item.styleCode === "CG" || item.styleCode === "MG")) {
      expect(style.doorStyle).toBe("Glass");
      expect(style.hardware).toContain("Tempered safety glass in aluminum frame");
    }
  });

  it("keeps source-listed glass walls active, correctly sized, and positively priced", async () => {
    const db = await getDb();
    if (!db) return;

    const [wall] = await db
      .select({
        masterCode: cabinets.masterCode,
        width: cabinets.width,
        height: cabinets.height,
        depth: cabinets.depth,
        numberOfDoors: cabinets.numberOfDoors,
        numberOfAdjShelves: cabinets.numberOfAdjShelves,
        isActive: cabinets.isActive,
        showInCatalog: cabinets.showInCatalog,
        showInDesigner: cabinets.showInDesigner,
      })
      .from(cabinets)
      .where(eq(cabinets.masterCode, "W-27-42"))
      .limit(1);

    expect(wall).toEqual(expect.objectContaining({
      masterCode: "W-27-42",
      width: "27.00",
      height: "42.00",
      depth: "12.00",
      numberOfDoors: 2,
      numberOfAdjShelves: 3,
      isActive: true,
      showInCatalog: true,
      showInDesigner: true,
    }));

    const glassMappings = await db
      .select({
        styleCode: doorStyles.styleCode,
        distributorSku: distributorSkus.distributorSku,
        listPrice: distributorSkus.listPrice,
        yourCost: distributorSkus.yourCost,
        homeownerPrice: distributorSkus.homeownerPrice,
        isAvailable: distributorSkus.isAvailable,
        isPublished: distributorSkus.isPublished,
      })
      .from(distributorSkus)
      .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
      .where(and(
        eq(distributorSkus.distributorId, SKYLINE),
        inArray(doorStyles.styleCode, ["CG", "MG"]),
        eq(distributorSkus.distributorSku, "W2742"),
      ));

    expect(glassMappings).toHaveLength(2);
    for (const mapping of glassMappings) {
      expect(mapping.isAvailable).toBe(true);
      expect(mapping.isPublished).toBe(true);
      expect(Number(mapping.listPrice)).toBeGreaterThan(0);
      expect(Number(mapping.yourCost)).toBeGreaterThan(0);
      expect(Number(mapping.homeownerPrice)).toBeGreaterThan(0);
    }

    // The newly verified Crystal Glass line must surface through the exact
    // public catalog contract, not merely exist as a database mapping.
    const [crystal] = await db.select({ id: doorStyles.id, styleCode: doorStyles.styleCode })
      .from(doorStyles)
      .where(and(eq(doorStyles.distributorId, SKYLINE), eq(doorStyles.styleCode, "CG")));
    expect(crystal).toBeDefined();
    if (!crystal) return;
    const catalog = await appRouter.createCaller(publicCtx()).cabinets.listForStyle({
      styleId: crystal.id,
      search: "W2742",
      limit: 20,
      offset: 0,
    });
    expect(catalog.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ masterCode: "W2742", width: "27.00", height: "42.00", depth: "12.00" }),
    ]));
  });

  it("preserves exact accessory geometry and source aliases without publishing the sample door", async () => {
    const db = await getDb();
    if (!db) return;

    const special = await db
      .select({
        masterCode: cabinets.masterCode,
        width: cabinets.width,
        height: cabinets.height,
        depth: cabinets.depth,
        cabinetStyle: cabinets.cabinetStyle,
        isActive: cabinets.isActive,
        showInCatalog: cabinets.showInCatalog,
        showInDesigner: cabinets.showInDesigner,
      })
      .from(cabinets)
      .where(inArray(cabinets.masterCode, ["MINI", "SD", "PWB-MOS-30-18"]));

    expect(special).toEqual(expect.arrayContaining([
      expect.objectContaining({ masterCode: "MINI", width: "12.00", height: "24.50", depth: "15.00" }),
      expect.objectContaining({ masterCode: "SD", width: "11.00", height: "15.00", depth: "0.75", isActive: false, showInCatalog: false, showInDesigner: false }),
      expect.objectContaining({ masterCode: "PWB-MOS-30-18", width: "30.00", height: "18.00", depth: "11.88", cabinetStyle: "openShelf" }),
    ]));

    const aliases = await db
      .select({ aliasCode: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode, conflictStatus: skuMasterAliases.conflictStatus })
      .from(skuMasterAliases)
      .where(inArray(skuMasterAliases.aliasCode, ["FHB09", "FHB18", "FHB24", "FHB30", "FHB36", "V36TDL", "V36TDR", "DWR3", "MOS3018", "MINIBASE"]));

    expect(aliases).toEqual(expect.arrayContaining([
      { aliasCode: "FHB09", masterCode: "BT9", conflictStatus: "ok" },
      { aliasCode: "FHB36", masterCode: "B36FH", conflictStatus: "ok" },
      { aliasCode: "V36TDL", masterCode: "V-36-TDL(V36TDL)", conflictStatus: "ok" },
      { aliasCode: "DWR3", masterCode: "BEP(DWR)3", conflictStatus: "ok" },
      { aliasCode: "MOS3018", masterCode: "PWB-MOS-30-18", conflictStatus: "ok" },
      { aliasCode: "MINIBASE", masterCode: "MINI", conflictStatus: "ok" },
    ]));
  });
});
