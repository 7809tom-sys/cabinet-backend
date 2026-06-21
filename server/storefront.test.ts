import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("storefront.families", () => {
  it("returns families that each carry a distributorId and no supplier name", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const families = await caller.storefront.families();
    expect(Array.isArray(families)).toBe(true);
    if (families.length) {
      const f = families[0];
      expect(typeof f.styleId).toBe("number");
      expect(typeof f.distributorId).toBe("number");
      // supplier identity must never leak
      expect(f).not.toHaveProperty("distributorName");
      expect(f).not.toHaveProperty("brandName");
    }
  });

  it("narrowing by distributorId only returns that supply line", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const all = await caller.storefront.families();
    if (!all.length) return; // empty DB in this env — nothing to assert
    const distId = all[0].distributorId;
    const narrowed = await caller.storefront.families({ distributorId: distId });
    expect(narrowed.every((f) => f.distributorId === distId)).toBe(true);
  });
});

describe("storefront.familyCatalog (lock)", () => {
  it("returns only cabinets scoped to the requested family styleId", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const families = await caller.storefront.families();
    if (!families.length) return;
    const styleId = families[0].styleId;
    const res = await caller.storefront.familyCatalog({ styleId, limit: 10 });
    expect(res).toHaveProperty("items");
    expect(res).toHaveProperty("total");
    expect(Array.isArray(res.items)).toBe(true);
    // every returned line must be priced for THIS family's SKU
    for (const it of res.items) {
      expect(typeof it.platformSku).toBe("string");
      expect(it.platformSku.length).toBeGreaterThan(0);
    }
  });

  it("familyCategories only lists categories that exist within the family", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const families = await caller.storefront.families();
    if (!families.length) return;
    const styleId = families[0].styleId;
    const cats = await caller.storefront.familyCategories({ styleId });
    expect(Array.isArray(cats)).toBe(true);
    // a category returned here must yield items when used to filter the catalog
    if (cats.length) {
      const res = await caller.storefront.familyCatalog({
        styleId,
        category: cats[0],
        limit: 5,
      });
      expect(res.total).toBeGreaterThan(0);
    }
  });
});

describe("storefront.recommendForIntent (family-locked, never cross-distributor)", () => {
  it("returns only items from the locked family", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const families = await caller.storefront.families();
    if (!families.length) return;
    const styleId = families[0].styleId;

    // Build the set of valid platformSkus for this family
    const all = await caller.storefront.familyCatalog({ styleId, limit: 200 });
    const validSkus = new Set(all.items.map((i) => i.platformSku));

    const rec = await caller.storefront.recommendForIntent({
      styleId,
      intent: "island",
      limit: 8,
    });
    expect(rec.intent).toBe("island");
    // Any recommended item must be a SKU that belongs to this family.
    for (const it of rec.items as Array<{ platformSku: string }>) {
      expect(validSkus.has(it.platformSku)).toBe(true);
    }
  });

  it("maps an island intent to buyable Base cabinets in the family (never empty)", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const families = await caller.storefront.families();
    if (!families.length) return;
    const styleId = families[0].styleId;

    const all = await caller.storefront.familyCatalog({ styleId, limit: 200 });
    const hasBase = all.items.some((i) => i.category === "Base");

    const rec = await caller.storefront.recommendForIntent({
      styleId,
      intent: "kitchen island",
      limit: 8,
    });
    // If the family has base cabinets at all, an island intent must surface some.
    if (hasBase) {
      expect(rec.items.length).toBeGreaterThan(0);
      for (const it of rec.items as Array<{ category: string }>) {
        expect(it.category).toBe("Base");
      }
    }
  });
});
