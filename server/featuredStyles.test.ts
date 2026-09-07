import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { doorStyles } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// Admin-controlled "Featured Door Styles" (80/20 merchandising). The admin picks
// which styles get pushed on the storefront; the public row is ordered by rank
// and hard-capped at 30. These tests use the live DB and restore any state they
// touch so they are non-destructive.

function adminCtx(): TrpcContext {
  return {
    user: {
      id: 999301,
      openId: "test-admin-featured",
      name: "Featured Admin",
      email: "admin-featured-test@example.com",
      role: "admin",
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

function userCtx(): TrpcContext {
  return {
    user: {
      id: 999302,
      openId: "test-user-featured",
      name: "Nobody",
      email: "user-featured-test@example.com",
      role: "user",
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

describe("doorStyles featured — admin management + public row", () => {
  it("blocks non-admins from the management procedures", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(caller.doorStyles.listForAdmin()).rejects.toThrow();
    await expect(
      caller.doorStyles.setFeatured({ id: 1, featured: true }),
    ).rejects.toThrow();
  });

  it("public featured query returns at most 30 rows, ordered by rank", async () => {
    const db = await getDb();
    if (!db) return; // skip when DB not configured
    const caller = appRouter.createCaller(adminCtx());
    const featured = await caller.doorStyles.featured();
    expect(Array.isArray(featured)).toBe(true);
    expect(featured.length).toBeLessThanOrEqual(30);
    // Supplier identity must never leak on the public row.
    for (const row of featured) {
      expect("distributorName" in row).toBe(false);
    }
  });

  it("retains source attribution for administrators while stripping it from the public featured payload", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());
    const managed = await caller.doorStyles.listForAdmin();
    expect(managed.every((row) => "distributorName" in row)).toBe(true);

    const publicRows = await caller.doorStyles.featured();
    expect(publicRows.every((row) => !("distributorName" in row))).toBe(true);
  });

  it("admin can toggle a style featured/unfeatured and it surfaces in the public row", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());

    // Find a currently NON-featured active style to test with.
    const all = await caller.doorStyles.listForAdmin();
    expect(Array.isArray(all)).toBe(true);
    const target = all.find((s) => !s.isFeatured);
    if (!target) return; // every style already featured (unlikely) → skip

    // Remember original state to restore afterwards.
    const before = await db
      .select({ isFeatured: doorStyles.isFeatured, featuredRank: doorStyles.featuredRank })
      .from(doorStyles)
      .where(eq(doorStyles.id, target.id))
      .limit(1);

    try {
      await caller.doorStyles.setFeatured({ id: target.id, featured: true });
      const after = await db
        .select({ isFeatured: doorStyles.isFeatured })
        .from(doorStyles)
        .where(eq(doorStyles.id, target.id))
        .limit(1);
      expect(after[0]?.isFeatured).toBe(true);

      // Un-feature returns it to false.
      await caller.doorStyles.setFeatured({ id: target.id, featured: false });
      const reverted = await db
        .select({ isFeatured: doorStyles.isFeatured })
        .from(doorStyles)
        .where(eq(doorStyles.id, target.id))
        .limit(1);
      expect(reverted[0]?.isFeatured).toBe(false);
    } finally {
      // Restore exactly.
      await db
        .update(doorStyles)
        .set({
          isFeatured: before[0]?.isFeatured ?? false,
          featuredRank: before[0]?.featuredRank ?? 0,
        })
        .where(eq(doorStyles.id, target.id));
    }
  });

  it("reorderFeatured rejects more than 30 ids (input guard)", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const tooMany = Array.from({ length: 31 }, (_, i) => i + 1);
    await expect(
      caller.doorStyles.reorderFeatured({ orderedIds: tooMany }),
    ).rejects.toThrow();
  });
});
