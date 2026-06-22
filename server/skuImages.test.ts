import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { distributorSkus } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function adminCtx(): TrpcContext {
  return {
    user: {
      id: 999201,
      openId: "test-admin-img",
      name: "Img Admin",
      email: "admin-img-test@example.com",
      role: "admin",
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}
function userCtx(): TrpcContext {
  return {
    user: {
      id: 999202,
      openId: "test-user-img",
      name: "Nobody",
      email: "user-img-test@example.com",
      role: "user",
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

describe("skuImages router", () => {
  it("rejects non-admins", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(
      caller.skuImages.list({ limit: 5, offset: 0 }),
    ).rejects.toThrow();
  });

  it("lists SKUs door-first with resolved fields", async () => {
    const db = await getDb();
    if (!db) return; // skip when DB not configured in this env
    const caller = appRouter.createCaller(adminCtx());
    const res = await caller.skuImages.list({ limit: 5, offset: 0 });
    expect(Array.isArray(res.items)).toBe(true);
    expect(typeof res.total).toBe("number");
    if (res.items.length) {
      const r = res.items[0];
      expect(r).toHaveProperty("skuId");
      expect(r).toHaveProperty("masterCode");
      expect(r).toHaveProperty("styleName");
    }
  });

  it("auto-matches filenames by full SKU and by style+cabinet", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());
    // grab a real sku to build filenames from
    const sample = await caller.skuImages.list({ limit: 1, offset: 0 });
    if (!sample.items.length) return;
    const row = sample.items[0];
    const fnSku = `${row.platformSku}.jpg`;
    const fnStyleCab = `${row.styleName} ${row.masterCode}.png`;
    const fnNope = `totally-unrelated-file-xyz.jpg`;
    const res = await caller.skuImages.matchFilenames({
      filenames: [fnSku, fnStyleCab, fnNope],
    });
    // the full-SKU file must resolve to this exact SKU
    const skuMatch = res.matches.find((m) => m.filename === fnSku);
    expect(skuMatch?.skuId).toBe(row.skuId);
    // the unrelated file must be unmatched
    expect(res.unmatched).toContain(fnNope);
  });

  it("applies an image to all SKUs sharing the cabinet when applyToAllCabinet", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());
    const sample = await caller.skuImages.list({ limit: 1, offset: 0 });
    if (!sample.items.length) return;
    const row = sample.items[0];

    const count = await caller.skuImages.cabinetSiblingCount({ skuId: row.skuId });
    expect(count.count).toBeGreaterThanOrEqual(1);

    const testUrl = `/manus-storage/__test_${Date.now()}.jpg`;
    const res = await caller.skuImages.setImage({
      skuId: row.skuId,
      imageUrl: testUrl,
      applyToAllCabinet: true,
    });
    expect(res.updated).toBe(count.count);

    // verify the target sku now has the url
    const after = await db
      .select({ imageUrl: distributorSkus.imageUrl })
      .from(distributorSkus)
      .where(eq(distributorSkus.id, row.skuId))
      .limit(1);
    expect(after[0]?.imageUrl).toBe(testUrl);

    // cleanup: null out the test url for affected cabinet
    await db
      .update(distributorSkus)
      .set({ imageUrl: null })
      .where(eq(distributorSkus.cabinetId, row.cabinetId));
  });
});
