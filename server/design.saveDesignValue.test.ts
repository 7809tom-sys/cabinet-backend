import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { crmDeals, crmActivities, crmDealDesigns, kitchenDesigns, designLeads } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const ctx = {
  user: { id: 999102, openId: "test-admin-dv", name: "Test Admin DV", email: "admin-dv@example.test", role: "admin" },
  req: { protocol: "https", headers: {} },
  res: { clearCookie: () => {} },
} as unknown as TrpcContext;
const customer = { name: "Price Check", email: "price-check@example.test", phone: "555-010-0188", address: { line1: "100 Test Street", city: "Testville", state: "WI", zip: "53186" } };

describe("design.save writes the kitchen price to the CRM deal", () => {
  it("stores the price, and a later save without a price does not erase it", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(ctx);
    const a = await caller.design.save({ customer, designValue: 4321.5, name: "DV Test", roomData: { width: 120, depth: 120 }, placedCabinets: [] });
    try {
      const [link] = await db.select().from(crmDealDesigns).where(eq(crmDealDesigns.designId, a.id));
      const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, link.dealId));
      expect(Number(deal.designValue)).toBe(4321.5);
      expect(Number(deal.estimatedValue)).toBe(4321.5);
      await caller.design.save({ id: a.id, customer, name: "DV Test", roomData: { width: 120, depth: 120 }, placedCabinets: [] });
      const [again] = await db.select().from(crmDeals).where(eq(crmDeals.id, link.dealId));
      expect(Number(again.designValue)).toBe(4321.5);
    } finally {
      const [link] = await db.select().from(crmDealDesigns).where(eq(crmDealDesigns.designId, a.id));
      if (link) {
        await db.delete(crmDealDesigns).where(eq(crmDealDesigns.dealId, link.dealId));
        await db.delete(crmActivities).where(eq(crmActivities.dealId, link.dealId));
        await db.delete(crmDeals).where(eq(crmDeals.id, link.dealId));
      }
      await db.delete(designLeads).where(eq(designLeads.email, customer.email));
      await db.delete(kitchenDesigns).where(eq(kitchenDesigns.id, a.id));
    }
  });
});
