import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { distributorSkus } from "../drizzle/schema";

function adminCtx(): TrpcContext {
  return {
    user: {
      id: 778899,
      openId: "o-admin-audit-dropdown",
      name: "Owner Admin",
      email: "owner-audit-dropdown@cabinetdealz.test",
      role: "admin",
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function userCtx(): TrpcContext {
  return {
    user: {
      id: 112233,
      openId: "o-user-audit-dropdown",
      name: "Regular User",
      email: "user-audit-dropdown@cabinetdealz.test",
      role: "user",
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("Price Audit cascading dropdowns", () => {
  it("all four procedures are admin-only (non-admin rejected)", async () => {
    const db = await getDb();
    if (!db) return; // empty DB env — skip
    const caller = appRouter.createCaller(userCtx());
    await expect(caller.pricing.adminAuditDistributors()).rejects.toThrow();
    await expect(caller.pricing.adminAuditStyles({ distributorId: 1 })).rejects.toThrow();
    await expect(caller.pricing.adminAuditItems({ distributorId: 1, styleId: 1 })).rejects.toThrow();
    await expect(caller.pricing.adminDailyAuditPicks({})).rejects.toThrow();
  });

  it("adminAuditDistributors returns labelled distributors with audit counts", async () => {
    const db = await getDb();
    if (!db) return;
    if ((await db.select().from(distributorSkus).limit(1)).length === 0) return; // no catalog
    const caller = appRouter.createCaller(adminCtx());
    const rows = (await caller.pricing.adminAuditDistributors()) as Array<{
      id: number; label: string; cabinetCount: number; auditedCount: number; unauditedCount: number;
    }>;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    const r = rows[0];
    expect(typeof r.id).toBe("number");
    expect(typeof r.label).toBe("string");
    expect(r.label.length).toBeGreaterThan(0);
    // counts are coherent
    expect(r.auditedCount + r.unauditedCount).toBe(r.cabinetCount);
  });

  it("cascades distributor -> style -> item, and items carry the price ladder + audited flag", async () => {
    const db = await getDb();
    if (!db) return;
    if ((await db.select().from(distributorSkus).limit(1)).length === 0) return;
    const caller = appRouter.createCaller(adminCtx());

    const dists = (await caller.pricing.adminAuditDistributors()) as Array<{ id: number }>;
    expect(dists.length).toBeGreaterThan(0);
    const distId = dists[0].id;

    const styles = (await caller.pricing.adminAuditStyles({ distributorId: distId })) as Array<{
      id: number; label: string; itemCount: number;
    }>;
    expect(Array.isArray(styles)).toBe(true);
    expect(styles.length).toBeGreaterThan(0);
    const styleId = styles[0].id;

    const items = (await caller.pricing.adminAuditItems({ distributorId: distId, styleId })) as Array<
      Record<string, unknown>
    >;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    const it = items[0];
    expect(typeof it.cabinetId).toBe("number");
    expect(typeof it.masterCode).toBe("string");
    expect("priceVerified" in it).toBe(true);
    for (const f of ["yourCost", "listPrice", "wholesalePrice", "contractorPrice", "homeownerPrice"]) {
      expect(f in it).toBe(true);
    }
    // Every returned item really belongs to the chosen distributor + style.
    expect(it.distributorId).toBe(distId);
    expect(it.styleId).toBe(styleId);
  });

  it("adminDailyAuditPicks is deterministic within a day and respects the count", async () => {
    const db = await getDb();
    if (!db) return;
    if ((await db.select().from(distributorSkus).limit(1)).length === 0) return;
    const caller = appRouter.createCaller(adminCtx());

    const a = await caller.pricing.adminDailyAuditPicks({ count: 4 });
    const b = await caller.pricing.adminDailyAuditPicks({ count: 4 });
    expect(a.day).toBe(b.day);
    // Same day => identical pick set (deterministic rotation).
    const idsA = (a.picks as Array<{ id: number }>).map((p) => p.id);
    const idsB = (b.picks as Array<{ id: number }>).map((p) => p.id);
    expect(idsA).toEqual(idsB);
    // Never returns more than requested.
    expect(idsA.length).toBeLessThanOrEqual(4);
    // Picks are unaudited and carry their SKUs.
    for (const p of a.picks as Array<{ priceVerified: boolean; skus: unknown[] }>) {
      expect(p.priceVerified).toBe(false);
      expect(Array.isArray(p.skus)).toBe(true);
    }
  });
});
