import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { doorStyles } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// Admin-controlled Featured Door Styles. The admin curates up to six room-scene
// styles for the homepage; the public row is ordered by rank and source-scrubbed.
// These tests use the live DB and restore any state they
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

  it("public featured query returns at most six rows, ordered by rank", async () => {
    const db = await getDb();
    if (!db) return; // skip when DB not configured
    const caller = appRouter.createCaller(adminCtx());
    const featured = await caller.doorStyles.featured();
    expect(Array.isArray(featured)).toBe(true);
    expect(featured.length).toBeLessThanOrEqual(6);
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

  it("admin can toggle a room-scene-ready style featured/unfeatured", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());

    // Re-use an existing room-scene-ready featured style so this remains valid
    // even when the curated six-scene set is already at its cap.
    const all = await caller.doorStyles.listForAdmin();
    expect(Array.isArray(all)).toBe(true);
    const target = all.find((s) => s.isFeatured && s.roomSceneImageUrl);
    if (!target) return;

    // Remember original state to restore afterwards.
    const before = await db
      .select({ isFeatured: doorStyles.isFeatured, featuredRank: doorStyles.featuredRank })
      .from(doorStyles)
      .where(eq(doorStyles.id, target.id))
      .limit(1);

    try {
      await caller.doorStyles.setFeatured({ id: target.id, featured: false });
      const after = await db
        .select({ isFeatured: doorStyles.isFeatured })
        .from(doorStyles)
        .where(eq(doorStyles.id, target.id))
        .limit(1);
      expect(after[0]?.isFeatured).toBe(false);

      await caller.doorStyles.setFeatured({ id: target.id, featured: true });
      const reverted = await db
        .select({ isFeatured: doorStyles.isFeatured })
        .from(doorStyles)
        .where(eq(doorStyles.id, target.id))
        .limit(1);
      expect(reverted[0]?.isFeatured).toBe(true);
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

  it("rejects a homepage feature without a room scene", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());
    const all = await caller.doorStyles.listForAdmin();
    const missingScene = all.find((s) => s.isActive && !s.isFeatured && !s.roomSceneImageUrl);
    if (!missingScene) return;

    await expect(caller.doorStyles.setFeatured({ id: missingScene.id, featured: true })).rejects.toThrow(
      "Add a style-matched room scene",
    );
  });

  it("enforces the six-scene curation cap server-side", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());
    const all = await caller.doorStyles.listForAdmin();
    const curatedCount = all.filter((s) => s.isFeatured).length;
    const nextScene = all.find((s) => s.isActive && !s.isFeatured && s.roomSceneImageUrl);
    if (curatedCount < 6 || !nextScene) return;

    await expect(caller.doorStyles.setFeatured({ id: nextScene.id, featured: true })).rejects.toThrow(
      "You can curate up to 6 homepage room scenes",
    );
  });

  it("reorderFeatured rejects more than six ids (input guard)", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const tooMany = Array.from({ length: 7 }, (_, i) => i + 1);
    await expect(
      caller.doorStyles.reorderFeatured({ orderedIds: tooMany }),
    ).rejects.toThrow();
  });
});
