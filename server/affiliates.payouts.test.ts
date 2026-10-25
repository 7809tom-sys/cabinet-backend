import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { affiliates, affiliatePayouts } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

const PARTNER = { id: 99999, email: "firstclassfcd@yahoo.com" };

function adminCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "o-admin",
      name: "Admin",
      email: "admin@cabinetdealz.test",
      role: "admin",
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function partnerCtx(): TrpcContext {
  return {
    user: {
      id: PARTNER.id,
      openId: "o-partner",
      name: "First Class",
      email: PARTNER.email,
      role: "partner",
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function strangerCtx(): TrpcContext {
  return {
    user: {
      id: 88888,
      openId: "o-stranger",
      name: "Nobody",
      email: "stranger-payout@nowhere.com",
      role: "user",
    } as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("affiliate weekly payouts", () => {
  it("adminWeeklyPayouts returns week buckets with the expected shape", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());
    const data = await caller.affiliates.adminWeeklyPayouts();
    expect(data).toBeDefined();
    expect(Array.isArray(data.weeks)).toBe(true);
    for (const w of data.weeks as Array<Record<string, unknown>>) {
      expect(typeof w.affiliateId).toBe("number");
      expect(typeof w.weekKey).toBe("string");
      expect(String(w.weekKey)).toMatch(/^\d{4}-W\d{2}$/);
      expect(typeof w.amountCents).toBe("number");
      expect(["pending", "issued", "paid"]).toContain(w.status);
    }
  });

  it("blocks non-admins from the weekly payout report", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(strangerCtx());
    await expect(caller.affiliates.adminWeeklyPayouts()).rejects.toThrow();
    const partner = appRouter.createCaller(partnerCtx());
    await expect(partner.affiliates.adminWeeklyPayouts()).rejects.toThrow();
  });

  it("adminMarkPayout upserts a payout row, snapshots the amount, and sets timestamps", async () => {
    const db = await getDb();
    if (!db) return;
    const aff = (await db.select().from(affiliates).where(eq(affiliates.slug, "firstclass")).limit(1))[0];
    if (!aff) return;
    const weekKey = "2099-W01"; // far-future key so it never collides with real data
    const caller = appRouter.createCaller(adminCtx());
    try {
      // mark issued
      await caller.affiliates.adminMarkPayout({
        affiliateId: aff.id,
        weekKey,
        amountCents: 12345,
        orderCount: 3,
        status: "issued",
      });
      let row = (await db.select().from(affiliatePayouts)
        .where(and(eq(affiliatePayouts.affiliateId, aff.id), eq(affiliatePayouts.weekKey, weekKey)))
        .limit(1))[0];
      expect(row).toBeDefined();
      expect(row.amountCents).toBe(12345);
      expect(row.status).toBe("issued");
      expect(row.issuedAt).not.toBeNull();
      expect(row.paidAt).toBeNull();

      // escalate to paid (same week → update, not insert)
      await caller.affiliates.adminMarkPayout({
        affiliateId: aff.id,
        weekKey,
        amountCents: 12345,
        orderCount: 3,
        status: "paid",
        method: "check",
        reference: "1001",
      });
      const rows = await db.select().from(affiliatePayouts)
        .where(and(eq(affiliatePayouts.affiliateId, aff.id), eq(affiliatePayouts.weekKey, weekKey)));
      expect(rows.length).toBe(1); // upsert, not duplicate
      row = rows[0];
      expect(row.status).toBe("paid");
      expect(row.paidAt).not.toBeNull();
      expect(row.method).toBe("check");
      expect(row.reference).toBe("1001");
    } finally {
      await db.delete(affiliatePayouts)
        .where(and(eq(affiliatePayouts.affiliateId, aff.id), eq(affiliatePayouts.weekKey, weekKey)));
    }
  });

  it("blocks non-admins from marking a payout", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(partnerCtx());
    await expect(
      caller.affiliates.adminMarkPayout({ affiliateId: 1, weekKey: "2099-W02", amountCents: 100, status: "paid" })
    ).rejects.toThrow();
  });

  it("myEarnings returns a per-week breakdown for a linked affiliate", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(partnerCtx());
    const data = await caller.affiliates.myEarnings();
    expect(data).not.toBeNull();
    expect(typeof data!.thisWeekKey).toBe("string");
    expect(typeof data!.pendingCents).toBe("number");
    expect(Array.isArray(data!.weeks)).toBe(true);
  });
});
