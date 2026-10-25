import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { cabinets, distributorCabinetOverrides, distributorSkus, distributors, doorStyles } from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";

const FILLER_CODES = [
  "AF3006", "OF323", "OF330", "OF335", "OF340", "OF384", "OF389", "OF394",
  "OF630", "OF635", "OF640", "OF684", "OF689", "OF694",
] as const;

const FILLER_IMAGES: Record<(typeof FILLER_CODES)[number], string> = {
  AF3006: "/manus-storage/aef-appliance-filler-three-pack_50708d9c.webp",
  OF323: "/manus-storage/aef-overlay-filler-3in_c10f1cc9.webp",
  OF330: "/manus-storage/aef-overlay-filler-3in_c10f1cc9.webp",
  OF335: "/manus-storage/aef-overlay-filler-3in_c10f1cc9.webp",
  OF340: "/manus-storage/aef-overlay-filler-3in_c10f1cc9.webp",
  OF384: "/manus-storage/aef-overlay-filler-3in_c10f1cc9.webp",
  OF389: "/manus-storage/aef-overlay-filler-3in_c10f1cc9.webp",
  OF394: "/manus-storage/aef-overlay-filler-3in_c10f1cc9.webp",
  OF630: "/manus-storage/aef-overlay-filler-6in_1b42acbe.webp",
  OF635: "/manus-storage/aef-overlay-filler-6in_1b42acbe.webp",
  OF640: "/manus-storage/aef-overlay-filler-6in_1b42acbe.webp",
  OF684: "/manus-storage/aef-overlay-filler-6in_1b42acbe.webp",
  OF689: "/manus-storage/aef-overlay-filler-6in_1b42acbe.webp",
  OF694: "/manus-storage/aef-overlay-filler-6in_1b42acbe.webp",
};

const PRINTED_LISTS: Record<(typeof FILLER_CODES)[number], readonly [number, number, number, number, number, number, number]> = {
  AF3006: [56, 186, 60, 80, 80, 140, 155],
  OF323: [23, 34, 36, 41, 41, 61, 71],
  OF330: [27, 44, 44, 54, 54, 84, 89],
  OF335: [35, 53, 53, 63, 68, 98, 108],
  OF340: [40, 60, 60, 70, 75, 110, 120],
  OF384: [77, 122, 118, 143, 148, 223, 248],
  OF389: [83, 130, 122, 157, 157, 242, 267],
  OF394: [87, 136, 129, 164, 169, 254, 279],
  OF630: [58, 89, 89, 109, 109, 169, 184],
  OF635: [67, 104, 98, 123, 128, 193, 213],
  OF640: [73, 119, 111, 141, 146, 221, 246],
  OF684: [154, 245, 232, 292, 302, 457, 507],
  OF689: [162, 260, 246, 311, 321, 486, 536],
  OF694: [173, 275, 261, 326, 336, 516, 566],
};

const PRICE_COLUMN: Record<string, number> = {
  TWP: 0, TGW: 0, TDW: 0, PGW: 1,
  SSA: 2, SSD: 2, SSE: 2, SSH: 2, SSJ: 2, SSK: 2, SSL: 2, SSM: 2, SSN: 2, SSO: 2, SSP: 2, SSQ: 2, SSR: 2, SSS: 2, SSV: 2, SSX: 2, SSZ: 2,
  LSA: 3, LSC: 3, LSN: 3, ZSA: 3, ZSB: 3, ZSC: 3, ZSI: 3, ZSK: 3, ZSL: 3, ZSM: 3, ZSN: 3, ZSO: 3, ZSP: 3, ZSU: 3, ZSV: 3, ZSW: 3,
  LSP: 4, LSR: 4,
  SCA: 5, SCL: 5, SCM: 5, SCN: 5, SCQ: 5, SCR: 5, SCZ: 5,
  ZCC: 6, ZCK: 6, ZCN: 6,
};

function publicCtx() {
  return { user: null, req: { headers: {} }, res: {} } as any;
}

describe("AEF source-priced filler stock", () => {
  it("publishes exactly the fourteen documented filler codes across all active AEF finishes with printed list prices", async () => {
    const db = await getDb();
    if (!db) return;
    const [aef] = await db.select({ id: distributors.id }).from(distributors).where(eq(distributors.code, "AEF")).limit(1);
    expect(aef).toBeDefined();

    const styles = await db.select({ id: doorStyles.id, styleCode: doorStyles.styleCode }).from(doorStyles).where(and(eq(doorStyles.distributorId, aef!.id), eq(doorStyles.isActive, true)));
    expect(styles).toHaveLength(49);

    const rows = await db
      .select({
        sourceCode: distributorSkus.distributorSku,
        masterCode: cabinets.masterCode,
        styleCode: doorStyles.styleCode,
        listPrice: distributorSkus.listPrice,
        available: distributorSkus.isAvailable,
        published: distributorSkus.isPublished,
        construction: distributorSkus.constructionType,
        width: distributorSkus.geometryWidth,
        depth: distributorSkus.geometryDepth,
        masterCategory: cabinets.category,
        masterSubCategory: cabinets.subCategory,
        placement: cabinets.placementType,
        skuImageUrl: distributorSkus.imageUrl,
        overrideImageUrl: distributorCabinetOverrides.imageUrl,
      })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
      .innerJoin(doorStyles, eq(doorStyles.id, distributorSkus.styleId))
      .leftJoin(distributorCabinetOverrides, and(eq(distributorCabinetOverrides.distributorId, distributorSkus.distributorId), eq(distributorCabinetOverrides.cabinetId, distributorSkus.cabinetId)))
      .where(and(eq(distributorSkus.distributorId, aef!.id), inArray(distributorSkus.distributorSku, [...FILLER_CODES])));

    expect(rows).toHaveLength(FILLER_CODES.length * styles.length);
    const rowsByCode = new Map<string, typeof rows>();
    for (const row of rows) rowsByCode.set(row.sourceCode, [...(rowsByCode.get(row.sourceCode) ?? []), row]);
    expect([...rowsByCode.keys()].sort()).toEqual([...FILLER_CODES].sort());

    for (const code of FILLER_CODES) {
      const stockRows = rowsByCode.get(code) ?? [];
      expect(stockRows).toHaveLength(49);
      for (const row of stockRows) {
        const column = PRICE_COLUMN[row.styleCode];
        expect(row).toMatchObject({
          masterCode: code,
          listPrice: PRINTED_LISTS[code][column]!.toFixed(2),
          available: true,
          published: true,
          construction: "frameless",
          depth: "0.750",
          masterCategory: "Accessory",
          masterSubCategory: "Filler",
          placement: "accessory",
          skuImageUrl: FILLER_IMAGES[code],
          overrideImageUrl: FILLER_IMAGES[code],
        });
        expect(row.skuImageUrl).not.toContain("aef-accessory-finish");
        expect(row.overrideImageUrl).not.toContain("aef-accessory-finish");
      }
    }
    expect(rowsByCode.get("OF335")![0]).toMatchObject({ width: "2.875" });
    expect(rowsByCode.get("OF635")![0]).toMatchObject({ width: "5.875" });
  });

  it("returns the selected AEF finish’s source filler stock to the regular Designer accessory catalog", async () => {
    const db = await getDb();
    if (!db) return;
    const [aef] = await db.select({ id: distributors.id }).from(distributors).where(eq(distributors.code, "AEF")).limit(1);
    const [lsp] = await db.select({ id: doorStyles.id }).from(doorStyles).where(and(eq(doorStyles.distributorId, aef!.id), eq(doorStyles.styleCode, "LSP"))).limit(1);
    const accessoryRows = await appRouter.createCaller(publicCtx()).design.placeableCabinets({ placement: "accessory", distributorId: aef!.id, styleId: lsp!.id });
    const codes = new Set(accessoryRows.map((item) => item.masterCode));
    for (const code of FILLER_CODES) expect(codes.has(code)).toBe(true);
    expect(accessoryRows.find((item) => item.masterCode === "OF335")).toMatchObject({ width: "2.875", height: "35.125", depth: "0.750", category: "Accessory", subCategory: "Filler" });
  });
});
