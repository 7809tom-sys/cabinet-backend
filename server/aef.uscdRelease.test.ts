import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { cabinets, distributorSkus, distributors, doorStyles } from "../drizzle/schema";
import { getDb } from "./db";
import { AEF_EXPANDED_SOURCE_GEOMETRY } from "../shared/aefFramelessExpandedGeometry";

type SourceRow = {
  sku: string;
  width?: number;
  height?: number;
  depth?: number;
  toeKickHeight?: number | null;
  priceCount: number;
  prices: string[];
};

const completeSource = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "scripts/data/aef-complete-source-manifest.json"), "utf8"),
) as SourceRow[];

const SOURCE_COLUMN_BY_STYLE: Record<string, number> = {
  TWP: 0, TGW: 0, TDW: 0, PGW: 1,
  SSA: 2, SSD: 2, SSE: 2, SSH: 2, SSJ: 2, SSK: 2, SSL: 2, SSM: 2, SSN: 2, SSO: 2, SSP: 2, SSQ: 2, SSR: 2, SSS: 2, SSV: 2, SSX: 2, SSZ: 2,
  LSA: 3, LSC: 3, LSN: 3, ZSA: 3, ZSB: 3, ZSC: 3, ZSI: 3, ZSK: 3, ZSL: 3, ZSM: 3, ZSN: 3, ZSO: 3, ZSP: 3, ZSU: 3, ZSV: 3, ZSW: 3,
  LSP: 4, LSR: 4,
  SCA: 5, SCL: 5, SCM: 5, SCN: 5, SCQ: 5, SCR: 5, SCZ: 5,
  ZCC: 6, ZCK: 6, ZCN: 6,
};

const sourcePrice = (value: string) => Number(value.replace(/[$,]/g, ""));
const landedCost = (price: number) => Math.round(Math.round(price * 0.23 * 100) / 100 * 1.07 * 100) / 100;

describe("AEF USCD Frameless release integrity", () => {
  it("uses the active USCD multiplier and the current homeowner tier for source list prices", async () => {
    const db = await getDb();
    if (!db) return;
    const [aef] = await db.select().from(distributors).where(eq(distributors.code, "AEF")).limit(1);
    const [scl] = await db.select().from(doorStyles).where(and(eq(doorStyles.distributorId, aef!.id), eq(doorStyles.styleCode, "SCL"))).limit(1);
    expect(aef).toMatchObject({
      name: "US Cabinet Depot Frameless",
      baseMultiplier: "0.2300",
      freightMultiplier: "0.0700",
      costMultiplier: "0.2461",
      retailPriceBasis: "cost_plus_tier",
    });
    expect(scl?.doorSampleImageUrl).toContain("SCL_cd4802db.png");

    const rows = await db
      .select({ code: cabinets.masterCode, listPrice: distributorSkus.listPrice, yourCost: distributorSkus.yourCost, homeownerPrice: distributorSkus.homeownerPrice, isAvailable: distributorSkus.isAvailable, isPublished: distributorSkus.isPublished, constructionType: distributorSkus.constructionType, geometryStatus: distributorSkus.geometryStatus })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
      .where(and(eq(distributorSkus.distributorId, aef!.id), eq(distributorSkus.styleId, scl!.id), inArray(cabinets.masterCode, ["B18", "W3012", "W3030"])));
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "B18", listPrice: "1212.00", yourCost: "298.27", homeownerPrice: "471.27", isAvailable: true, isPublished: true, constructionType: "frameless", geometryStatus: "verified" }),
      expect.objectContaining({ code: "W3012", listPrice: "596.00", yourCost: "146.68", homeownerPrice: "231.75", isAvailable: true, isPublished: true, constructionType: "frameless", geometryStatus: "verified" }),
      expect.objectContaining({ code: "W3030", listPrice: "1205.00", yourCost: "296.55", homeownerPrice: "468.55", isAvailable: true, isPublished: true, constructionType: "frameless", geometryStatus: "verified" }),
    ]));
  });

  it("keeps shared framed master dimensions and images untouched", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db
      .select({ masterCode: cabinets.masterCode, width: cabinets.width, height: cabinets.height, depth: cabinets.depth, catalogImageUrl: cabinets.catalogImageUrl })
      .from(cabinets)
      .where(inArray(cabinets.masterCode, ["B18", "W3012", "W3030"]));
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ masterCode: "B18", width: "18.000", height: "34.500", depth: "24.000", catalogImageUrl: "/manus-storage/media-library/1790257590606_b12_b21_ecac0f38" }),
      expect.objectContaining({ masterCode: "W3012", width: "30.000", height: "12.000", depth: "12.000" }),
      expect.objectContaining({ masterCode: "W3030", width: "30.000", height: "30.000", depth: "12.000" }),
    ]));
  });

  it("publishes every complete-line source cabinet with its printed geometry and all seven finish prices", async () => {
    const db = await getDb();
    if (!db) return;
    const [aef] = await db.select().from(distributors).where(eq(distributors.code, "AEF")).limit(1);
    const styles = await db.select({ id: doorStyles.id, code: doorStyles.styleCode }).from(doorStyles).where(eq(doorStyles.distributorId, aef!.id));
    expect(styles).toHaveLength(49);
    expect(Object.keys(AEF_EXPANDED_SOURCE_GEOMETRY)).toHaveLength(151);
    expect(completeSource).toHaveLength(162);

    const cabinetSource = completeSource.filter((row) => row.width !== undefined);
    expect(cabinetSource).toHaveLength(151);
    for (const row of cabinetSource) {
      expect(AEF_EXPANDED_SOURCE_GEOMETRY[row.sku]).toMatchObject({
        width: row.width,
        height: row.height,
        depth: row.depth,
        toeKickHeight: row.toeKickHeight ?? null,
        sourcePage: expect.any(String),
      });
    }

    const rows = await db
      .select({
        sourceSku: distributorSkus.distributorSku,
        code: cabinets.masterCode,
        styleCode: doorStyles.styleCode,
        listPrice: distributorSkus.listPrice,
        yourCost: distributorSkus.yourCost,
        homeownerPrice: distributorSkus.homeownerPrice,
        published: distributorSkus.isPublished,
        available: distributorSkus.isAvailable,
        construction: distributorSkus.constructionType,
        geometryWidth: distributorSkus.geometryWidth,
        geometryHeight: distributorSkus.geometryHeight,
        geometryDepth: distributorSkus.geometryDepth,
        geometryToeKick: distributorSkus.geometryToeKickHeight,
        geometryStatus: distributorSkus.geometryStatus,
      })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
      .innerJoin(doorStyles, eq(doorStyles.id, distributorSkus.styleId))
      .where(eq(distributorSkus.distributorId, aef!.id));
    const sourceSet = new Set(completeSource.map((row) => row.sku));
    const expanded = rows.filter((row) => sourceSet.has(row.sourceSku));
    const bySku = new Map<string, typeof expanded>();
    for (const row of expanded) bySku.set(row.sourceSku, [...(bySku.get(row.sourceSku) ?? []), row]);
    expect(bySku.size).toBe(162);

    for (const source of completeSource) {
      const sourceRows = bySku.get(source.sku) ?? [];
      const expectedStyleCount = source.priceCount === 7 ? 49 : source.priceCount === 2 ? 4 : 2;
      expect(sourceRows).toHaveLength(expectedStyleCount);
      for (const row of sourceRows) {
        const column = SOURCE_COLUMN_BY_STYLE[row.styleCode];
        const expectedList = source.priceCount === 7
          ? sourcePrice(source.prices[column]!)
          : source.priceCount === 2
            ? sourcePrice(source.prices[column === 0 ? 0 : 1]!)
            : sourcePrice(source.prices[0]!);
        const cost = landedCost(expectedList);
        expect(row).toMatchObject({
          code: source.sku,
          listPrice: expectedList.toFixed(2),
          yourCost: cost.toFixed(2),
          homeownerPrice: (Math.round(cost * 1.58 * 100) / 100).toFixed(2),
          published: true,
          available: true,
          construction: "frameless",
          geometryStatus: "verified",
        });
      }
      const geometry = AEF_EXPANDED_SOURCE_GEOMETRY[source.sku];
      if (geometry) {
        expect(sourceRows[0]).toMatchObject({
          geometryWidth: geometry.width.toFixed(3),
          geometryHeight: geometry.height.toFixed(3),
          geometryDepth: geometry.depth.toFixed(3),
          geometryToeKick: geometry.toeKickHeight?.toFixed(2) ?? null,
        });
      }
    }
  });
});
