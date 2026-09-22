import { and, eq, isNotNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb, getPricingSettings } from "./db";
import { distributorSkus } from "../drizzle/schema";

function adminContext(): TrpcContext {
  return {
    user: {
      id: 993155,
      openId: "pricing-refresh-admin",
      name: "Pricing Refresh Admin",
      email: "pricing-refresh@example.com",
      role: "admin",
      distributorId: null,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

// MySQL ROUND rounds a positive half-cent away from zero; protect the test from
// JavaScript binary-float artifacts around values such as 160.545.
const cents = (value: number) => Math.floor((value + 1e-9) * 100 + 0.5) / 100;

describe("pricing.adminUpdateMargins tier refresh", () => {
  it("synchronizes persisted wholesale, contractor, and retail prices from the durable cost", async () => {
    const db = await getDb();
    if (!db) return;
    const settings = await getPricingSettings();
    const [source] = await db
      .select({ id: distributorSkus.id, yourCost: distributorSkus.yourCost })
      .from(distributorSkus)
      .where(and(
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
        isNotNull(distributorSkus.yourCost),
      ))
      .limit(1);
    if (!source?.yourCost) return;

    const caller = appRouter.createCaller(adminContext());
    const result = await caller.pricing.adminUpdateMargins({
      globalMarkupBps: settings.globalMarkupBps,
      homeownerMarkupBps: settings.homeownerMarkupBps,
      contractorMarkupBps: settings.contractorMarkupBps,
      wholesaleMarkupBps: settings.wholesaleMarkupBps,
    });

    expect(result.recalculation.updated).toBeGreaterThan(0);
    expect(result.recalculation.costPlusTier + result.recalculation.sourceListRetail)
      .toBe(result.recalculation.updated);
    expect(result.recalculation.skippedUnpriced).toBeGreaterThanOrEqual(0);
    const [stored] = await db
      .select({
        wholesalePrice: distributorSkus.wholesalePrice,
        contractorPrice: distributorSkus.contractorPrice,
        homeownerPrice: distributorSkus.homeownerPrice,
      })
      .from(distributorSkus)
      .where(eq(distributorSkus.id, source.id))
      .limit(1);
    const cost = Number(source.yourCost);
    expect(Number(stored?.wholesalePrice)).toBe(cents(cost * settings.wholesaleMarkupBps / 10000));
    expect(Number(stored?.contractorPrice)).toBe(cents(cost * settings.contractorMarkupBps / 10000));
    expect(Number(stored?.homeownerPrice)).toBe(cents(cost * settings.homeownerMarkupBps / 10000));
  });
});
