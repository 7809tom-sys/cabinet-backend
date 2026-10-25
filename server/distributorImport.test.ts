import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { cabinets, distributors } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function adminCtx(): TrpcContext {
  return {
    user: {
      id: 999101,
      openId: "test-admin-dist",
      name: "Dist Admin",
      email: "admin-dist-test@example.com",
      role: "admin",
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

function userCtx(): TrpcContext {
  return {
    user: {
      id: 999102,
      openId: "test-user-dist",
      name: "Nobody",
      email: "user-dist-test@example.com",
      role: "user",
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

const TEST_CODE = "ZZTEST-99"; // unlikely to collide with seeded catalog

async function cleanup() {
  const db = await getDb();
  if (!db) return;
  await db.delete(cabinets).where(eq(cabinets.masterCode, TEST_CODE));
}

describe("distributor import router", () => {
  it("rejects non-admins", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(
      caller.distributorAdmin.adminList()
    ).rejects.toThrow();
  });

  it("previews then commits a new item, and is idempotent on re-import", async () => {
    const db = await getDb();
    if (!db) return; // empty DB env — skip
    await cleanup();

    const caller = appRouter.createCaller(adminCtx());
    const dists = await caller.distributorAdmin.adminList();
    if (dists.length === 0) return; // no distributors seeded — skip
    const distributorId = dists[0].id;

    const csv = `Master Code,Description,Category,Width,Height,Depth\n${TEST_CODE},"Test Import Base Cabinet",Base,24,34.5,24`;

    try {
      // Preview: should plan one create, no errors.
      const preview = await caller.distributorAdmin.importPreview({
        distributorId,
        csv,
      });
      expect(preview.fatalErrors).toHaveLength(0);
      expect(preview.summary.toCreate).toBe(1);
      expect(preview.summary.errors).toBe(0);
      expect(preview.rows[0].action).toBe("create-info");

      // Nothing written yet.
      const before = await db
        .select()
        .from(cabinets)
        .where(eq(cabinets.masterCode, TEST_CODE));
      expect(before).toHaveLength(0);

      // Commit: creates the cabinet.
      const r1 = await caller.distributorAdmin.importCommit({
        distributorId,
        csv,
      });
      expect(r1.created).toBe(1);

      const after = await db
        .select()
        .from(cabinets)
        .where(eq(cabinets.masterCode, TEST_CODE));
      expect(after).toHaveLength(1);
      expect(after[0].category).toBe("Base");
      expect(Number(after[0].width)).toBe(24);

      // Re-import the same row → now it exists, should be update (no new create).
      const preview2 = await caller.distributorAdmin.importPreview({
        distributorId,
        csv,
      });
      expect(preview2.summary.toCreate).toBe(0);
      // description+category+dims present → counts as an update plan
      expect(preview2.rows[0].action).not.toBe("create-info");
    } finally {
      await cleanup();
    }
  });

  it("flags a new item missing description/category as an error in preview", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());
    const dists = await caller.distributorAdmin.adminList();
    if (dists.length === 0) return;

    // Code-only row for a non-existent cabinet → cannot create.
    const csv = `Master Code,List Price\nZZTEST-NOEXIST-1,123`;
    const preview = await caller.distributorAdmin.importPreview({
      distributorId: dists[0].id,
      csv,
    });
    // pricing present but no style chosen → fatal
    expect(preview.fatalErrors.length).toBeGreaterThan(0);
  });
});
