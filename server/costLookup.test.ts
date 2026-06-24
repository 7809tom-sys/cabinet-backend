import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { distributorSkus, costChangeLog } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

function adminCtx(): TrpcContext {
  return {
    user: {
      id: 12321,
      openId: "o-admin-costlookup",
      name: "Owner Admin",
      email: "owner-costlookup@cabinetdealz.test",
      role: "admin",
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function userCtx(): TrpcContext {
  return {
    user: {
      id: 45654,
      openId: "o-user-costlookup",
      name: "Regular User",
      email: "user-costlookup@cabinetdealz.test",
      role: "user",
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("admin Cost Lookup / Verify tool", () => {
  it("adminLookupCost is admin-only (non-admin is rejected)", async () => {
    const db = await getDb();
    if (!db) return; // empty DB env — skip
    const caller = appRouter.createCaller(userCtx());
    await expect(caller.pricing.adminLookupCost({ query: "B" })).rejects.toThrow();
  });

  it("adminLookupCost returns cabinets with nested SKUs and the full price ladder", async () => {
    const db = await getDb();
    if (!db) return;
    // Pick any cabinet that actually has at least one SKU mapped.
    const anySku = await db.select().from(distributorSkus).limit(1);
    if (anySku.length === 0) return; // no catalog seeded — skip
    const caller = appRouter.createCaller(adminCtx());

    // Look up by a single common letter to guarantee at least one hit.
    const res = await caller.pricing.adminLookupCost({ query: "B" });
    expect(res).toHaveProperty("cabinets");
    expect(Array.isArray(res.cabinets)).toBe(true);
    if (res.cabinets.length > 0) {
      const cab = res.cabinets[0] as {
        id: number;
        masterCode: string;
        skus: Array<Record<string, unknown>>;
      };
      expect(typeof cab.masterCode).toBe("string");
      expect(Array.isArray(cab.skus)).toBe(true);
      if (cab.skus.length > 0) {
        const sku = cab.skus[0];
        for (const f of ["yourCost", "listPrice", "wholesalePrice", "contractorPrice", "homeownerPrice"]) {
          expect(f in sku).toBe(true);
        }
        expect("platformSku" in sku).toBe(true);
      }
    }
  });

  it("adminUpdateSkuCost writes an audit row per changed field and is reversible", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(distributorSkus).limit(1);
    if (rows.length === 0) return;
    const sku = rows[0];
    const caller = appRouter.createCaller(adminCtx());

    const original = sku.contractorPrice;
    const originalNum = original === null ? null : Number(original);
    const newVal = (originalNum ?? 100) + 1.23;

    const result = await caller.pricing.adminUpdateSkuCost({
      skuId: sku.id,
      contractorPrice: newVal,
    });
    expect(result.success).toBe(true);
    expect(result.changed).toBeGreaterThanOrEqual(1);

    // SKU column actually changed.
    const after = await db.select().from(distributorSkus).where(eq(distributorSkus.id, sku.id)).limit(1);
    expect(Number(after[0].contractorPrice)).toBeCloseTo(newVal, 2);

    // Audit row captured old -> new + who.
    const log = await db
      .select()
      .from(costChangeLog)
      .where(eq(costChangeLog.skuId, sku.id))
      .orderBy(desc(costChangeLog.createdAt))
      .limit(1);
    expect(log.length).toBe(1);
    expect(log[0].field).toBe("contractorPrice");
    expect(Number(log[0].newValue)).toBeCloseTo(newVal, 2);
    expect(log[0].changedByName).toBe("Owner Admin");

    // Restore original value to keep the dataset clean.
    await caller.pricing.adminUpdateSkuCost({
      skuId: sku.id,
      contractorPrice: originalNum,
    });
  });

  it("adminUpdateSkuCost with no actual change records zero audit rows", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(distributorSkus).limit(1);
    if (rows.length === 0) return;
    const sku = rows[0];
    const caller = appRouter.createCaller(adminCtx());
    const same = sku.contractorPrice === null ? null : Number(sku.contractorPrice);
    const result = await caller.pricing.adminUpdateSkuCost({
      skuId: sku.id,
      contractorPrice: same,
    });
    expect(result.changed).toBe(0);
  });

  it("adminCostHistory returns newest-first rows for a SKU", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(distributorSkus).limit(1);
    if (rows.length === 0) return;
    const sku = rows[0];
    const caller = appRouter.createCaller(adminCtx());

    // Make a change so there's at least one history row.
    const base = sku.listPrice === null ? 200 : Number(sku.listPrice);
    await caller.pricing.adminUpdateSkuCost({ skuId: sku.id, listPrice: base + 5 });

    const history = await caller.pricing.adminCostHistory({ skuId: sku.id, limit: 10 });
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThanOrEqual(1);
    if (history.length >= 2) {
      expect(history[0].createdAt >= history[1].createdAt).toBe(true);
    }

    // Restore.
    await caller.pricing.adminUpdateSkuCost({
      skuId: sku.id,
      listPrice: sku.listPrice === null ? null : Number(sku.listPrice),
    });
  });

  it("adminCostHistory rejects when neither skuId nor masterCode is given", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());
    await expect(caller.pricing.adminCostHistory({})).rejects.toThrow();
  });
});
