import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { crmDeals, crmActivities, crmDealDesigns, kitchenDesigns, designViewLog, designLeads } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function adminCtx(): TrpcContext {
  return {
    user: { id: 999102, openId: "test-admin-dv", name: "Test Admin DV", email: "admin-dv-test@example.com", role: "admin" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

describe("crm: design created date and view log", () => {
  it("logs each design open once per 10 minutes and shows it on the CRM deal", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());
    const design = await caller.design.save({
      customer: { name: "Test Customer", email: "customer@example.test", phone: "555-010-0199", address: { line1: "100 Test Street", city: "Testville", state: "WI", zip: "53186" } },
      name: "Spec Design — View Log",
      roomData: { width: 120, depth: 120 },
      placedCabinets: [],
    } as never);
    const dealId = design.dealId as number;
    try {
      expect(dealId).toBeGreaterThan(0);
      await caller.design.byId({ id: design.id, crmDealId: dealId } as never);
      await caller.design.byId({ id: design.id, crmDealId: dealId } as never); // within 10 min: not logged again
      const views = await db.select().from(designViewLog).where(eq(designViewLog.designId, design.id));
      expect(views.length).toBe(1);
      expect(views[0].viewerKind).toBe("crm");
      const deal = await caller.crm.deal({ id: dealId });
      const linked = (deal as { linkedDesigns: { designId: number; designCreatedAt: unknown; viewCount: number; recentViews: unknown[] }[] }).linkedDesigns;
      expect(linked.length).toBe(1);
      expect(linked[0].designCreatedAt).toBeTruthy();
      expect(linked[0].viewCount).toBe(1);
      expect(linked[0].recentViews.length).toBe(1);
    } finally {
      await db.delete(designViewLog).where(eq(designViewLog.designId, design.id));
      if (dealId) {
        await db.delete(crmDealDesigns).where(eq(crmDealDesigns.dealId, dealId));
        await db.delete(crmActivities).where(eq(crmActivities.dealId, dealId));
        await db.delete(crmDeals).where(eq(crmDeals.id, dealId));
      }
      await db.delete(designLeads).where(eq(designLeads.email, "customer@example.test"));
      await db.delete(kitchenDesigns).where(eq(kitchenDesigns.id, design.id));
    }
  });
});
