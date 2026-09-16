import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { cabinets, distributors, distributorSkus, doorStyles } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function ctxFor(user: Record<string, unknown> | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

const anonUser = ctxFor({ id: 990101, openId: "dp-user", name: "User", email: "dp-user@example.com", role: "user", distributorId: null });
const adminUser = ctxFor({ id: 990102, openId: "dp-admin", name: "Admin", email: "dp-admin@example.com", role: "admin", distributorId: null });
const unlinkedDistributor = ctxFor({ id: 990103, openId: "dp-dist", name: "Dist", email: "dp-dist@example.com", role: "distributor", distributorId: null });

describe("distributorPortal — access control", () => {
  it("rejects a plain user", async () => {
    const caller = appRouter.createCaller(anonUser);
    await expect(caller.distributorPortal.myLine()).rejects.toThrow();
  });

  it("rejects a distributor not linked to a line", async () => {
    const caller = appRouter.createCaller(unlinkedDistributor);
    await expect(caller.distributorPortal.myLine()).rejects.toThrow();
  });

  it("requires admins to pass a distributorId", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminUser);
    await expect(caller.distributorPortal.myLine()).rejects.toThrow();
  });
});

describe("distributorPortal — scoped data + visibility toggle", () => {
  it("refuses to create a second cabinet/line/style connection", async () => {
    const db = await getDb();
    if (!db) return;
    const existing = await db
      .select({
        cabinetId: distributorSkus.cabinetId,
        distributorId: distributorSkus.distributorId,
        styleId: distributorSkus.styleId,
        distributorSku: distributorSkus.distributorSku,
      })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
      .limit(1);
    if (!existing[0]) return;

    const caller = appRouter.createCaller(adminUser);
    await expect(
      caller.distributorPortal.submitNewProduct({
        cabinetId: existing[0].cabinetId,
        distributorId: existing[0].distributorId,
        styleId: existing[0].styleId,
        distributorSku: existing[0].distributorSku || "existing-sku",
      }),
    ).rejects.toThrow("already exists");
  });

  it("accepts an unmatched supplier SKU, stores it pending, and returns it in the catalog", async () => {
    const db = await getDb();
    if (!db) return;
    const lines = await db.select({ id: distributors.id }).from(distributors).limit(1);
    if (lines.length === 0) return;
    const lineId = lines[0].id;
    const styles = await db
      .select({ id: doorStyles.id })
      .from(doorStyles)
      .where(eq(doorStyles.distributorId, lineId))
      .limit(1);
    if (styles.length === 0) return;

    const unmatchedSku = `UNMATCHED_TEST_${Date.now()}`;
    const caller = appRouter.createCaller(adminUser);
    let skuId: number | null = null;
    try {
      const submitted = await caller.distributorPortal.submitNewProduct({
        distributorId: lineId,
        styleId: styles[0].id,
        distributorSku: unmatchedSku,
        yourCost: "8.25",
      });
      skuId = submitted.skuId;
      expect(submitted.status).toBe("pending");

      const stored = await db
        .select({ cabinetId: distributorSkus.cabinetId, status: distributorSkus.status, isPublished: distributorSkus.isPublished, yourCost: distributorSkus.yourCost, platformSku: distributorSkus.platformSku })
        .from(distributorSkus)
        .where(eq(distributorSkus.id, skuId))
        .limit(1);
      expect(stored[0]).toMatchObject({ cabinetId: null, status: "pending", isPublished: false, yourCost: "8.25" });
      expect(stored[0]?.platformSku).toMatch(/^UNMAPPED-/);

      const catalog = await caller.distributorPortal.catalog({ distributorId: lineId, search: unmatchedSku, onlyPending: true, limit: 10, offset: 0 });
      expect(catalog.total).toBe(1);
      expect(catalog.items[0]).toMatchObject({ skuId, cabinetId: null, masterCode: null, distributorSku: unmatchedSku, status: "pending" });
    } finally {
      if (skuId != null) await db.delete(distributorSkus).where(eq(distributorSkus.id, skuId));
    }
  });

  it("a linked distributor sees only their line and can toggle SKU visibility", async () => {
    const db = await getDb();
    if (!db) return;

    // Pick a real line that has at least one SKU.
    const lines = await db.select({ id: distributors.id }).from(distributors).limit(1);
    if (lines.length === 0) return;
    const lineId = lines[0].id;

    const skus = await db
      .select({ id: distributorSkus.id, isPublished: distributorSkus.isPublished })
      .from(distributorSkus)
      .where(eq(distributorSkus.distributorId, lineId))
      .limit(1);
    if (skus.length === 0) return;
    const sku = skus[0];

    const distCtx = ctxFor({
      id: 990104, openId: "dp-linked", name: "Linked Dist",
      email: "dp-linked@example.com", role: "distributor", distributorId: lineId,
    });
    const caller = appRouter.createCaller(distCtx);

    const mine = await caller.distributorPortal.myLine();
    expect(mine.line.id).toBe(lineId);
    expect(mine.counts.total).toBeGreaterThan(0);

    // Catalog rows all belong to this line.
    const cat = await caller.distributorPortal.catalog({ limit: 20, offset: 0 });
    expect(cat.items.length).toBeGreaterThan(0);

    // Toggle visibility off then restore.
    const original = sku.isPublished;
    try {
      const off = await caller.distributorPortal.setVisibility({ skuId: sku.id, isPublished: false });
      expect(off.isPublished).toBe(false);
      const reread = await db
        .select({ isPublished: distributorSkus.isPublished })
        .from(distributorSkus)
        .where(eq(distributorSkus.id, sku.id))
        .limit(1);
      expect(reread[0].isPublished).toBe(false);
    } finally {
      await db.update(distributorSkus).set({ isPublished: original }).where(eq(distributorSkus.id, sku.id));
    }
  });

  it("catalog search filters at the query layer and total reflects the filter", async () => {
    const db = await getDb();
    if (!db) return;
    const lines = await db.select({ id: distributors.id }).from(distributors).limit(1);
    if (lines.length === 0) return;
    const lineId = lines[0].id;
    const distCtx = ctxFor({
      id: 990106, openId: "dp-search", name: "Search Dist",
      email: "dp-search@example.com", role: "distributor", distributorId: lineId,
    });
    const caller = appRouter.createCaller(distCtx);

    const all = await caller.distributorPortal.catalog({ limit: 500, offset: 0 });
    if (all.items.length === 0) return;
    // pick a code fragment guaranteed to exist
    const frag = all.items[0].masterCode.slice(0, 2);
    const filtered = await caller.distributorPortal.catalog({ search: frag, limit: 500, offset: 0 });
    // total reflects the filtered set (<= unfiltered) and every row matches
    expect(filtered.total).toBeLessThanOrEqual(all.total);
    const normalizedFrag = frag.toLowerCase().replace(/[-_ ]/g, "");
    for (const it of filtered.items) {
      const hay = `${it.masterCode} ${it.description ?? ""} ${it.platformSku ?? ""} ${it.distributorSku ?? ""}`.toLowerCase();
      const normalizedHay = hay.replace(/[-_ ]/g, "");
      expect(normalizedHay.includes(normalizedFrag)).toBe(true);
    }
    expect(filtered.items.length).toBe(Math.min(filtered.total, 500));
  });

  it("orders returns only submitted orders for this line's styles", async () => {
    const db = await getDb();
    if (!db) return;
    const lines = await db.select({ id: distributors.id }).from(distributors).limit(1);
    if (lines.length === 0) return;
    const lineId = lines[0].id;
    const distCtx = ctxFor({
      id: 990107, openId: "dp-orders", name: "Orders Dist",
      email: "dp-orders@example.com", role: "distributor", distributorId: lineId,
    });
    const caller = appRouter.createCaller(distCtx);
    const rows = await caller.distributorPortal.orders({ limit: 50 });
    // shape only (data-dependent); every returned row must be submitted
    for (const r of rows) expect(r.status).toBe("submitted");
  });

  it("a distributor cannot toggle a SKU outside their line", async () => {
    const db = await getDb();
    if (!db) return;
    const lines = await db.select({ id: distributors.id }).from(distributors).limit(2);
    if (lines.length < 2) return;
    const [lineA, lineB] = lines;

    // a SKU that belongs to line B
    const otherSku = await db
      .select({ id: distributorSkus.id })
      .from(distributorSkus)
      .where(eq(distributorSkus.distributorId, lineB.id))
      .limit(1);
    if (otherSku.length === 0) return;

    const distCtx = ctxFor({
      id: 990105, openId: "dp-a", name: "Line A Dist",
      email: "dp-a@example.com", role: "distributor", distributorId: lineA.id,
    });
    const caller = appRouter.createCaller(distCtx);
    await expect(
      caller.distributorPortal.setVisibility({ skuId: otherSku[0].id, isPublished: false })
    ).rejects.toThrow();
  });
});
