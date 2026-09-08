import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { doorStyles, doorStyleRoomScenes } from "../drizzle/schema";
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

  it("public featured query returns only safe scene identifiers and image URLs", async () => {
    const db = await getDb();
    if (!db) return; // skip when DB not configured
    const caller = appRouter.createCaller(adminCtx());
    const featured = await caller.doorStyles.featured();
    expect(Array.isArray(featured)).toBe(true);
    // Supplier identity must never leak on the public row.
    for (const row of featured) {
      expect("distributorName" in row).toBe(false);
      expect(row.roomScenes.every((scene) => !("sourceNote" in scene) && !("sourceDistributorId" in scene))).toBe(true);
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

  it("keeps the authoritative style shipping origin private while allowing an admin to update it", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());
    const all = await caller.doorStyles.listForAdmin();
    const target = all[0];
    if (!target) return;
    const originalZip = target.warehouseZip ?? null;
    const originalFlatFee = target.flatFreightFeeCents ?? null;

    try {
      await caller.doorStyles.adminUpdateDoorStyle({
        id: target.id,
        warehouseZip: "30303",
        flatFreightFeeCents: 42500,
      });
      const managed = await caller.doorStyles.listForAdmin();
      expect(managed.find((row) => row.id === target.id)?.warehouseZip).toBe("30303");
      expect(managed.find((row) => row.id === target.id)?.flatFreightFeeCents).toBe(42500);

      const publicRows = await caller.doorStyles.list();
      expect(publicRows.every((row) => !("warehouseZip" in row))).toBe(true);
      const featuredRows = await caller.doorStyles.featured();
      expect(featuredRows.every((row) => !("warehouseZip" in row))).toBe(true);
    } finally {
      await caller.doorStyles.adminUpdateDoorStyle({
        id: target.id,
        warehouseZip: originalZip,
        flatFreightFeeCents: originalFlatFee,
      });
    }
  });

  it("rejects an invalid style shipping origin ZIP", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.doorStyles.adminUpdateDoorStyle({ id: 1, warehouseZip: "303" }),
    ).rejects.toThrow("Shipping origin ZIP must be exactly 5 digits");
  });

  it("admin can toggle a room-scene-ready style featured/unfeatured", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());

    // Re-use an existing room-scene-ready featured style so this remains valid
    // even when the curated six-scene set is already at its cap.
    const all = await caller.doorStyles.listForAdmin();
    expect(Array.isArray(all)).toBe(true);
    const target = all.find((s) => s.isFeatured && s.roomScenes?.some((scene) => scene.isActive && scene.isVerified));
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
    const missingScene = all.find((s) => s.isActive && !s.isFeatured && !s.roomScenes?.some((scene) => scene.isActive && scene.isVerified));
    if (!missingScene) return;

    await expect(caller.doorStyles.setFeatured({ id: missingScene.id, featured: true })).rejects.toThrow(
      "Add a style-matched room scene",
    );
  });

  it("limits each Door Style library to six scenes", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const all = await caller.doorStyles.listForAdmin();
    const target = all[0];
    if (!target) return;
    const scenes = target.roomScenes ?? [];
    if (scenes.length < 6) return;
    await expect(caller.doorStyles.addRoomScene({ styleId: target.id, imageUrl: "https://example.invalid/scene.jpg" })).rejects.toThrow("up to 6 room scenes");
  });

  it("keeps scene-management procedures unavailable to non-admins", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(appRouter.createCaller(userCtx()).doorStyles.addRoomScene({ styleId: 1, imageUrl: "https://example.invalid/scene.jpg" })).rejects.toThrow();
  });
});
