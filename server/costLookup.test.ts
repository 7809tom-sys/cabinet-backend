import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb, getPricingSettings } from "./db";
import { distributorSkus, costChangeLog, distributors } from "../drizzle/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { landedCostFromList } from "./lib/distributorCostMultiplier";

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

  it("recalculates the U.S. Cabinet Depot price ladder from an edited verified list price", async () => {
    const db = await getDb();
    if (!db) return;
    const [uscd] = await db
      .select({ id: distributors.id, base: distributors.baseMultiplier, freight: distributors.freightMultiplier })
      .from(distributors)
      .where(eq(distributors.code, "USCD"))
      .limit(1);
    if (!uscd) return;
    const [sku] = await db
      .select()
      .from(distributorSkus)
      .where(and(
        eq(distributorSkus.distributorId, uscd.id),
        gt(distributorSkus.listPrice, "0"),
      ))
      .limit(1);
    if (!sku?.listPrice) return;
    const caller = appRouter.createCaller(adminCtx());
    const originalList = Number(sku.listPrice);
    // A full dollar change must cross the two-cent-stage landed-cost rounding
    // boundary and therefore prove the source-list edit re-prices the line.
    const editedList = originalList + 1;
    const base = Number(uscd.base);
    const freight = Number(uscd.freight);
    const settings = await getPricingSettings();

    try {
      const result = await caller.pricing.adminUpdateSkuCost({ skuId: sku.id, listPrice: editedList });
      expect(result.success).toBe(true);
      expect(result.changed).toBeGreaterThan(0);
      expect(result.recalculation.updated).toBeGreaterThan(0);

      const [after] = await db.select().from(distributorSkus).where(eq(distributorSkus.id, sku.id)).limit(1);
      const expectedCost = landedCostFromList(editedList, base, freight);
      expect(Number(after.yourCost)).toBe(expectedCost);
      expect(Number(after.wholesalePrice)).toBe(Math.round(expectedCost * settings.wholesaleMarkupBps / 10000 * 100) / 100);
      expect(Number(after.contractorPrice)).toBe(Math.round(expectedCost * settings.contractorMarkupBps / 10000 * 100) / 100);
      expect(Number(after.homeownerPrice)).toBe(Math.round(expectedCost * settings.homeownerMarkupBps / 10000 * 100) / 100);

      const log = await db
        .select()
        .from(costChangeLog)
        .where(eq(costChangeLog.skuId, sku.id))
        .orderBy(desc(costChangeLog.createdAt))
        .limit(2);
      expect(log.some((row) => row.field === "listPrice" && Number(row.newValue) === editedList)).toBe(true);
      expect(log.some((row) => row.field === "yourCost" && Number(row.newValue) === expectedCost)).toBe(true);
    } finally {
      await caller.pricing.adminUpdateSkuCost({ skuId: sku.id, listPrice: originalList });
    }
  });

  it("adminUpdateSkuCost with no actual change records zero audit rows", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(distributorSkus).limit(1);
    if (rows.length === 0) return;
    const sku = rows[0];
    const caller = appRouter.createCaller(adminCtx());
    const result = await caller.pricing.adminUpdateSkuCost({ skuId: sku.id });
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
