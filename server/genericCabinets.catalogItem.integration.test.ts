import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { cabinets, distributors, distributorSkus, doorStyles } from "../drizzle/schema";

function adminContext(): TrpcContext {
  return {
    user: { id: 993111, openId: "catalog-item-admin", name: "Catalog Admin", email: "catalog-admin@example.com", role: "admin", distributorId: null },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

describe("genericCabinets.saveCatalogItem", () => {
  it("rejects an unpriced item even as a draft, then publishes the same positively priced master", async () => {
    const db = await getDb();
    if (!db) return;
    const [line] = await db.select({ id: distributors.id }).from(distributors).limit(1);
    if (!line) return;
    const [style] = await db.select({ id: doorStyles.id }).from(doorStyles).where(eq(doorStyles.distributorId, line.id)).limit(1);
    if (!style) return;

    const caller = appRouter.createCaller(adminContext());
    const stamp = Date.now();
    const masterCode = `CAT-ITEM-${stamp}`;
    const distributorSku = `CATITEM${stamp}`;
    let cabinetId: number | null = null;
    try {
      await expect(caller.genericCabinets.saveCatalogItem({
        mode: "draft",
        masterCode,
        description: "Test 24 in base cabinet",
        category: "Base",
        subCategory: "Standard Base",
        width: 24,
        height: 34.5,
        depth: 24,
        placementType: "base",
        numberOfDoors: 1,
        numberOfDrawers: 1,
      })).rejects.toThrow("positive List Price or Your Cost");

      const draft = await caller.genericCabinets.saveCatalogItem({
        mode: "draft",
        masterCode,
        description: "Test 24 in base cabinet",
        category: "Base",
        subCategory: "Standard Base",
        width: 24,
        height: 34.5,
        depth: 24,
        placementType: "base",
        numberOfDoors: 1,
        numberOfDrawers: 1,
        source: {
          distributorId: line.id,
          styleId: style.id,
          distributorSku,
          listPrice: 125.5,
          isAvailable: true,
        },
      });
      cabinetId = draft.id;
      expect(draft).toMatchObject({ masterCode, isPublished: false, sourceSkuId: expect.any(Number) });

      const [storedDraft] = await db.select({ isActive: cabinets.isActive, showInCatalog: cabinets.showInCatalog, showInDesigner: cabinets.showInDesigner, category: cabinets.category, width: cabinets.width }).from(cabinets).where(eq(cabinets.id, cabinetId)).limit(1);
      expect(storedDraft).toMatchObject({ isActive: false, showInCatalog: false, showInDesigner: false, category: "Base", width: "24.00" });

      const [pendingSource] = await db.select({ isPublished: distributorSkus.isPublished, status: distributorSkus.status }).from(distributorSkus).where(eq(distributorSkus.id, draft.sourceSkuId!)).limit(1);
      expect(pendingSource).toEqual({ isPublished: false, status: "pending" });

      const published = await caller.genericCabinets.saveCatalogItem({
        id: cabinetId,
        mode: "publish",
        masterCode,
        description: "Test 24 in base cabinet",
        category: "Base",
        subCategory: "Standard Base",
        width: 24,
        height: 34.5,
        depth: 24,
        placementType: "base",
        numberOfDoors: 1,
        numberOfDrawers: 1,
        source: {
          distributorId: line.id,
          styleId: style.id,
          distributorSku,
          listPrice: 125.5,
          isAvailable: true,
        },
      });
      expect(published).toMatchObject({ id: cabinetId, masterCode, isPublished: true });
      expect(published.sourceSkuId).toEqual(expect.any(Number));

      const [storedPublished] = await db.select({ isActive: cabinets.isActive, showInCatalog: cabinets.showInCatalog, showInDesigner: cabinets.showInDesigner }).from(cabinets).where(eq(cabinets.id, cabinetId)).limit(1);
      expect(storedPublished).toEqual({ isActive: true, showInCatalog: true, showInDesigner: true });
      const [source] = await db.select({ cabinetId: distributorSkus.cabinetId, listPrice: distributorSkus.listPrice, isPublished: distributorSkus.isPublished, isAvailable: distributorSkus.isAvailable, status: distributorSkus.status }).from(distributorSkus).where(eq(distributorSkus.id, published.sourceSkuId!)).limit(1);
      expect(source).toMatchObject({ cabinetId, listPrice: "125.50", isPublished: true, isAvailable: true, status: "approved" });

      const listed = await caller.genericCabinets.list({ search: masterCode, page: 1, pageSize: 10 });
      expect(listed.rows).toEqual(expect.arrayContaining([expect.objectContaining({ id: cabinetId, masterCode, category: "Base", width: "24.00", isActive: true, showInCatalog: true, showInDesigner: true })]));

      const publicCatalog = await caller.cabinets.listForStyle({ styleId: style.id, search: masterCode, limit: 20, offset: 0 });
      expect(publicCatalog.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: cabinetId, masterCode, category: "Base", width: "24.00" }),
      ]));

      const designPicker = await caller.design.placeableCabinets({
        placement: "base",
        distributorId: line.id,
        styleId: style.id,
        search: masterCode,
      });
      expect(designPicker).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: cabinetId, masterCode, placement: "base", width: "24.00", height: "34.50", depth: "24.00" }),
      ]));

      await expect(caller.genericCabinets.saveCatalogItem({
        mode: "draft",
        masterCode,
        description: "Duplicate",
        category: "Base",
        source: {
          distributorId: line.id,
          styleId: style.id,
          distributorSku,
          listPrice: 125.5,
          isAvailable: true,
        },
      })).rejects.toThrow("already exists or conflicts");
    } finally {
      if (cabinetId != null) {
        await db.delete(distributorSkus).where(eq(distributorSkus.cabinetId, cabinetId));
        await db.delete(cabinets).where(eq(cabinets.id, cabinetId));
      }
    }
  });

  it("requires administrator access", async () => {
    const caller = appRouter.createCaller({ user: { id: 993112, role: "user" } } as any);
    await expect(caller.genericCabinets.saveCatalogItem({
      mode: "draft", masterCode: "BLOCKED-CATALOG-ITEM", description: "Blocked", category: "Base",
    })).rejects.toThrow();
  });
});
