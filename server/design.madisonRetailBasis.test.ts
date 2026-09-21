import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { cabinets } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: () => {}, clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("Designer source-list retail pricing", () => {
  it("uses Madison's verified list as homeowner price rather than treating it as cost", async () => {
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

    expect(navyCoreDb24).toMatchObject({
      cabinetId: threeDrawerBase!.id,
      styleId: 330019,
      listPrice: "1050.00",
      homeownerPrice: "1050.00",
    });
  });
});
