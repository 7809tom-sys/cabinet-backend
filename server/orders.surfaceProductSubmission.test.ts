import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { getDb } from "./db";
import type { TrpcContext } from "./_core/context";
import { orderRequests } from "../drizzle/schema";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("orders.createRequest selected surface products", () => {
  it("persists a priced countertop slab without inventing a cabinet link", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const caller = appRouter.createCaller(publicCtx());
    let createdId: number | null = null;

    try {
      const created = await caller.orders.createRequest({
        originatorEmail: `surface-order-${Date.now()}@example.test`,
        source: "manual",
        styleId: null,
        styleName: null,
        tier: "Homeowner",
        submit: false,
        lineItems: [{
          cabinetId: null,
          masterCode: "PEL-404",
          rawCode: "PEL-404",
          description: "Calacatta Quartz Slab",
          qty: 2,
          unitPrice: 1200,
          linePrice: 2400,
          doorStyle: null,
          styleId: null,
          tier: "Homeowner",
          matched: true,
        }],
      });
      createdId = created.id;
      const [saved] = await db
        .select({ lineItems: orderRequests.lineItems })
        .from(orderRequests)
        .where(eq(orderRequests.id, created.id))
        .limit(1);

      expect(saved?.lineItems).toEqual([expect.objectContaining({
        cabinetId: null,
        masterCode: "PEL-404",
        description: "Calacatta Quartz Slab",
        qty: 2,
        unitPrice: 1200,
        linePrice: 2400,
        styleId: null,
        doorStyle: null,
        matched: true,
      })]);
    } finally {
      if (createdId != null) await db.delete(orderRequests).where(eq(orderRequests.id, createdId));
    }
  });
});
