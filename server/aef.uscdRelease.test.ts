import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { cabinets, distributorSkus, distributors, doorStyles } from "../drizzle/schema";
import { getDb } from "./db";

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
      expect.objectContaining({ masterCode: "B18", width: "18.00", height: "34.50", depth: "24.00", catalogImageUrl: "/manus-storage/media-library/1790257590606_b12_b21_ecac0f38" }),
      expect.objectContaining({ masterCode: "W3012", width: "30.00", height: "12.00", depth: "12.00" }),
      expect.objectContaining({ masterCode: "W3030", width: "30.00", height: "30.00", depth: "12.00" }),
    ]));
  });
});
