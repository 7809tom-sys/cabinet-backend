import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { crmDeals, crmActivities } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// A "designer" is internal sales staff: CRM-only access to the admin backend.
// They share the HOUSE board with admins but must be blocked from every other
// admin-only procedure (catalog/pricing/distributors/etc.).
function designerCtx(): TrpcContext {
  return {
    user: {
      id: 999010,
      openId: "test-designer",
      name: "Test Designer",
      email: "designer-role-test@example.com",
      role: "designer",
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

async function cleanup(dealId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(crmActivities).where(eq(crmActivities.dealId, dealId));
  await db.delete(crmDeals).where(eq(crmDeals.id, dealId));
}

describe("designer role — CRM access (house scope)", () => {
  it("a designer sees the HOUSE board and can manage deals like an admin", async () => {
    const db = await getDb();
    if (!db) return; // empty DB env — skip
    const caller = appRouter.createCaller(designerCtx());

    // designer board resolves to the house scope (shared with admin)
    const board = await caller.crm.board();
    expect(board.scope).toBe("house");

    const { id } = await caller.crm.create({
      title: "Designer Deal — Role Spec",
      contactName: "Lead From Designer",
      estimatedValue: 8000,
    });
    expect(id).toBeGreaterThan(0);

    try {
      const detail = await caller.crm.deal({ id });
      expect(detail.deal.affiliateId).toBeNull(); // house deal
      await caller.crm.moveStage({ id, stage: "qualified" });
      const moved = await caller.crm.deal({ id });
      expect(moved.deal.stage).toBe("qualified");
    } finally {
      await caller.crm.remove({ id });
      await cleanup(id);
    }
  });
});

describe("designer role — blocked from admin-only surfaces", () => {
  it("a designer is FORBIDDEN from admin-only procedures (margins, fee settings, customers)", async () => {
    const caller = appRouter.createCaller(designerCtx());
    // These are adminProcedure-gated; a designer must be rejected.
    await expect(caller.pricing.adminGetMargins()).rejects.toThrow();
    await expect(caller.pricing.adminGetFeeSettings()).rejects.toThrow();
    await expect(caller.customers.list({})).rejects.toThrow();
  });
});
