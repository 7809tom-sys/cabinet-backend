import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, getPricingSettings } from "./db";
import { distributors, distributorSkus, doorStyles } from "../drizzle/schema";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const CAPITAL_DISTRIBUTOR_ID = 210002;
const GRID_PRICE_FOR_B12 = {
  SU: "542.00",
  OC: "629.00",
  HS: "629.00",
  HH: "629.00",
  HR: "657.00",
} as const;

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("Capital pricing-grid door styles", () => {
  it("uses pages 17–27 to make every verified new style purchasable", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const targetCodes = Object.keys(GRID_PRICE_FOR_B12);
    const styles = await db
      .select({ id: doorStyles.id, styleCode: doorStyles.styleCode, isActive: doorStyles.isActive, status: doorStyles.specificationStatus })
      .from(doorStyles)
      .where(and(
        eq(doorStyles.distributorId, CAPITAL_DISTRIBUTOR_ID),
        inArray(doorStyles.styleCode, targetCodes),
      ));
    expect(styles).toHaveLength(targetCodes.length);
    expect(styles.every((style) => style.isActive && style.status === "purchasable")).toBe(true);

    const priceRows = await db
      .select({
        styleCode: doorStyles.styleCode,
        listPrice: distributorSkus.listPrice,
        yourCost: distributorSkus.yourCost,
        homeownerPrice: distributorSkus.homeownerPrice,
        isAvailable: distributorSkus.isAvailable,
        isPublished: distributorSkus.isPublished,
      })
      .from(distributorSkus)
      .innerJoin(doorStyles, eq(doorStyles.id, distributorSkus.styleId))
      .where(and(
        eq(distributorSkus.distributorId, CAPITAL_DISTRIBUTOR_ID),
        eq(distributorSkus.distributorSku, "B12"),
        inArray(doorStyles.styleCode, targetCodes),
      ));
    expect(Object.fromEntries(priceRows.map((row) => [row.styleCode, String(row.listPrice)]))).toEqual(GRID_PRICE_FOR_B12);
    expect(priceRows.every((row) => row.isAvailable && row.isPublished)).toBe(true);
    const [capital] = await db
      .select({ costMultiplier: distributors.costMultiplier })
      .from(distributors)
      .where(eq(distributors.id, CAPITAL_DISTRIBUTOR_ID));
    expect(Number(capital?.costMultiplier)).toBeCloseTo(0.3);
    const pricingSettings = await getPricingSettings();
    for (const row of priceRows) {
      expect(Number(row.yourCost)).toBeCloseTo(Number(row.listPrice) * Number(capital?.costMultiplier), 2);
      expect(Number(row.homeownerPrice)).toBeCloseTo(
        Math.round((Number(row.yourCost) * (Number(pricingSettings.homeownerMarkupBps) / 10000 + 1e-8) * 100)) / 100,
        2,
      );
    }

    const caller = appRouter.createCaller(publicCtx());
    const sellableStyles = await caller.doorStyles.list();
    expect(new Set(sellableStyles.filter((style) => targetCodes.includes(style.styleCode)).map((style) => style.styleCode)))
      .toEqual(new Set(targetCodes));
    const references = await caller.doorStyles.specificationReferences();
    expect(references.some((style) => targetCodes.includes(style.styleCode))).toBe(false);
  });
});
