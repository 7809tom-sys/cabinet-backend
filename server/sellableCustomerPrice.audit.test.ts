import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { cabinets, distributorSkus } from "../drizzle/schema";
import { getDb } from "./db";

describe("sellable catalog customer-price truth", () => {
  it("does not leave an active published available catalog SKU without a positive customer price", async () => {
    const db = await getDb();
    if (!db) return;

    const invalidSellableRows = await db
      .select({
        cabinetId: cabinets.id,
        masterCode: cabinets.masterCode,
        distributorSkuId: distributorSkus.id,
        distributorSku: distributorSkus.distributorSku,
        distributorId: distributorSkus.distributorId,
        styleId: distributorSkus.styleId,
        listPrice: distributorSkus.listPrice,
        adjustedListPrice: distributorSkus.adjustedListPrice,
        homeownerPrice: distributorSkus.homeownerPrice,
      })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
      .where(and(
        eq(cabinets.isActive, true),
        eq(cabinets.showInCatalog, true),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
        eq(distributorSkus.status, "approved"),
        sql`COALESCE(${distributorSkus.homeownerPrice}, ${distributorSkus.adjustedListPrice}, ${distributorSkus.listPrice}, 0) <= 0`,
      ));

    expect(invalidSellableRows).toEqual([]);
  });
});
