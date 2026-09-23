import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb, getPricingSettings } from "./db";
import { cabinets, distributorSkus } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: () => {}, clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("Designer Madison tier pricing", () => {
  it("uses Madison's verified landed cost and the saved homeowner margin, never its source list", async () => {
    const db = await getDb();
    if (!db) return;
    const [threeDrawerBase] = await db
      .select({ id: cabinets.id })
      .from(cabinets)
      .where(eq(cabinets.masterCode, "3DB24"));
    expect(threeDrawerBase).toBeDefined();

    const caller = appRouter.createCaller(publicCtx());
    const [navyCoreDb24] = await caller.design.priceForCabinetsByStyles({
      pairs: [{ cabinetId: threeDrawerBase!.id, styleId: 330019 }],
      distributorId: 210002,
    });
    const [source] = await db
      .select({ yourCost: distributorSkus.yourCost })
      .from(distributorSkus)
      .where(and(
        eq(distributorSkus.cabinetId, threeDrawerBase!.id),
        eq(distributorSkus.styleId, 330019),
        eq(distributorSkus.distributorId, 210002),
      ))
      .limit(1);
    expect(source?.yourCost).toBeTruthy();
    const settings = await getPricingSettings();
    const expectedHomeowner = (
      Math.round(Number(source!.yourCost) * Number(settings.homeownerMarkupBps) / 10000 * 100) / 100
    ).toFixed(2);

    expect(navyCoreDb24).toMatchObject({
      cabinetId: threeDrawerBase!.id,
      styleId: 330019,
      listPrice: "1050.00",
      homeownerPrice: expectedHomeowner,
    });
  });
});
