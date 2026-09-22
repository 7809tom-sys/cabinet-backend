import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb, getPricingSettings } from "./db";
import { distributors, distributorSkus, doorStyles } from "../drizzle/schema";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { landedCostFromList } from "./lib/distributorCostMultiplier";

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
    expect(styles.every((style) => style.status === "purchasable")).toBe(true);
    const activeTargetCodes = styles.filter((style) => style.isActive).map((style) => style.styleCode);
    expect(activeTargetCodes.length).toBeGreaterThan(0);

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
      .select({ baseMultiplier: distributors.baseMultiplier, freightMultiplier: distributors.freightMultiplier, retailPriceBasis: distributors.retailPriceBasis })
      .from(distributors)
      .where(eq(distributors.id, CAPITAL_DISTRIBUTOR_ID));
    expect(Number(capital?.baseMultiplier)).toBeCloseTo(0.23);
    expect(Number(capital?.freightMultiplier)).toBeCloseTo(0.07);
    expect(capital?.retailPriceBasis).toBe("cost_plus_tier");
    const settings = await getPricingSettings();
    for (const row of priceRows) {
      const cost = landedCostFromList(Number(row.listPrice), Number(capital?.baseMultiplier), Number(capital?.freightMultiplier));
      expect(Number(row.yourCost)).toBe(cost);
      expect(Number(row.homeownerPrice)).toBe(Math.round(cost * settings.homeownerMarkupBps / 10000 * 100) / 100);
    }

    const caller = appRouter.createCaller(publicCtx());
    const sellableStyles = await caller.doorStyles.list();
    expect(new Set(sellableStyles.filter((style) => activeTargetCodes.includes(style.styleCode)).map((style) => style.styleCode)))
      .toEqual(new Set(activeTargetCodes));
    const references = await caller.doorStyles.specificationReferences();
    expect(references.some((style) => targetCodes.includes(style.styleCode))).toBe(false);
  });
});
