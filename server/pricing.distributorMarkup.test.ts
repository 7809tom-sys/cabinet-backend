import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { distributors } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// Per-supply-line markup override (Admin → Pricing & Margins). The admin can
// nudge an individual supply line's price up via distributors.markupPercent
// (decimal fraction, 0.15 = +15%). The margins tab edits it inline through
// pricing.adminSetDistributorMarkup and reads it back via pricing.adminGetMargins.
// These tests use the live DB and restore any state they touch.

function adminCtx(): TrpcContext {
  return {
    user: {
      id: 999401,
      openId: "test-admin-distmarkup",
      name: "Markup Admin",
      email: "admin-distmarkup-test@example.com",
      role: "admin",
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

function userCtx(): TrpcContext {
  return {
    user: {
      id: 999402,
      openId: "test-user-distmarkup",
      name: "Nobody",
      email: "user-distmarkup-test@example.com",
      role: "user",
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

describe("pricing — per-supply-line markup override", () => {
  it("blocks non-admins from the markup procedures", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(caller.pricing.adminGetMargins()).rejects.toThrow();
    await expect(
      caller.pricing.adminSetDistributorMarkup({ distributorId: 1, markupPercent: 0.1 }),
    ).rejects.toThrow();
  });

  it("admin can set a supply-line markup and read it back via adminGetMargins", async () => {
    const db = await getDb();
    if (!db) return; // skip when DB not configured
    const caller = appRouter.createCaller(adminCtx());

    // Pick any active supply line to test against.
    const margins = await caller.pricing.adminGetMargins();
    const target = margins.distributors[0];
    if (!target) return; // no active supply lines → skip

    // Remember the original markup so we can restore it exactly.
    const before = await db
      .select({ markupPercent: distributors.markupPercent })
      .from(distributors)
      .where(eq(distributors.id, target.id))
      .limit(1);

    try {
      await caller.pricing.adminSetDistributorMarkup({
        distributorId: target.id,
        markupPercent: 0.125,
      });
      const after = await caller.pricing.adminGetMargins();
      const updated = after.distributors.find((d) => d.id === target.id);
      expect(updated).toBeTruthy();
      expect(Number(updated!.markupPercent)).toBeCloseTo(0.125, 5);
    } finally {
      // Restore exactly (string column; null-safe).
      await db
        .update(distributors)
        .set({ markupPercent: before[0]?.markupPercent ?? "0" })
        .where(eq(distributors.id, target.id));
    }
  });

  it("rejects an out-of-range markup (>10 / 1000%)", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.pricing.adminSetDistributorMarkup({ distributorId: 1, markupPercent: 99 }),
    ).rejects.toThrow();
  });
});
