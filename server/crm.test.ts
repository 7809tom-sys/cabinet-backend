import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { crmDeals, crmActivities } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function adminCtx(): TrpcContext {
  return {
    user: { id: 999001, openId: "test-admin", name: "Test Admin", email: "admin-crm-test@example.com", role: "admin" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

function anonUserCtx(): TrpcContext {
  // a logged-in user with no admin role and no linked affiliate
  return {
    user: { id: 999002, openId: "test-nobody", name: "Nobody", email: "nobody-crm-test@example.com", role: "user" },
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

describe("crm router — admin (house) scope", () => {
  it("creates a house deal, moves stages (logging activity), and deletes it", async () => {
    const db = await getDb();
    if (!db) return; // empty DB env — skip
    const caller = appRouter.createCaller(adminCtx());

    const { id } = await caller.crm.create({
      title: "Test Deal — CRM Spec",
      contactName: "Jane Tester",
      estimatedValue: 12000,
      priority: "high",
      language: "es",
    });
    expect(id).toBeGreaterThan(0);

    try {
      // appears as a HOUSE deal (affiliateId null) on the admin board
      const board = await caller.crm.board();
      expect(board.scope).toBe("house");
      const found = board.deals.find((d) => d.id === id);
      expect(found).toBeTruthy();
      expect(found?.affiliateId).toBeNull();
      expect(found?.language).toBe("es");

      // move stage → logs a stage_change activity
      await caller.crm.moveStage({ id, stage: "qualified" });
      const detail = await caller.crm.deal({ id });
      expect(detail.deal.stage).toBe("qualified");
      expect(detail.activities.some((a) => a.kind === "stage_change")).toBe(true);

      // moving to won sets closedAt
      await caller.crm.moveStage({ id, stage: "won" });
      const won = await caller.crm.deal({ id });
      expect(won.deal.closedAt).toBeTruthy();

      // add a note activity
      await caller.crm.addActivity({ dealId: id, body: "Called customer, left voicemail", kind: "call" });
      const withNote = await caller.crm.deal({ id });
      expect(withNote.activities.some((a) => a.kind === "call")).toBe(true);
    } finally {
      await caller.crm.remove({ id });
      await cleanup(id);
    }
  });
});

describe("crm router — scope isolation", () => {
  it("a non-admin user with no linked affiliate is forbidden", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(anonUserCtx());
    await expect(caller.crm.board()).rejects.toThrow();
  });
});
