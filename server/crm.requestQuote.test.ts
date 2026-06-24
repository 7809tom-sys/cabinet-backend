import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { crmDeals, crmActivities, crmDealDesigns, kitchenDesigns } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// A plain member (role "user") — NOT admin, NOT affiliate. requestQuoteFromDesign
// must still work for them by creating a HOUSE deal.
function memberCtx(): TrpcContext {
  return {
    user: { id: 999301, openId: "test-member-rq", name: "Test Member RQ", email: "member-rq-test@example.com", role: "user" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

async function cleanup(dealIds: number[], designIds: number[]) {
  const db = await getDb();
  if (!db) return;
  for (const dealId of dealIds) {
    await db.delete(crmDealDesigns).where(eq(crmDealDesigns.dealId, dealId));
    await db.delete(crmActivities).where(eq(crmActivities.dealId, dealId));
    await db.delete(crmDeals).where(eq(crmDeals.id, dealId));
  }
  for (const id of designIds) {
    await db.delete(kitchenDesigns).where(eq(kitchenDesigns.id, id));
  }
}

describe("crm router — requestQuoteFromDesign", () => {
  it("creates a house deal from a saved design (member, non-admin) and links it", { timeout: 30000 }, async () => {
    const db = await getDb();
    if (!db) return; // empty DB env — skip
    const caller = appRouter.createCaller(memberCtx());

    const design = await caller.design.save({
      name: "Oak St Kitchen",
      roomData: { width: 144, depth: 120 },
      placedCabinets: [],
      projectName: "123 Oak St",
      roomLabel: "Kitchen",
      roomType: "kitchen",
    });
    expect(design.id).toBeGreaterThan(0);

    let dealId = 0;
    try {
      const r = await caller.crm.requestQuoteFromDesign({
        designId: design.id,
        contactEmail: "member-rq-test@example.com",
        estimatedValue: 8200,
      });
      dealId = r.id;
      expect(r.reused).toBe(false);
      expect(dealId).toBeGreaterThan(0);

      // It must be a HOUSE deal (affiliateId NULL) so the sales team sees it.
      const rows = await db.select().from(crmDeals).where(eq(crmDeals.id, dealId));
      expect(rows[0]).toBeTruthy();
      expect(rows[0].affiliateId).toBeNull();
      expect(rows[0].source).toBe("storefront");
      // Title derives from project + room.
      expect(rows[0].title).toContain("123 Oak St");
      expect(rows[0].title).toContain("Kitchen");
      expect(Number(rows[0].estimatedValue)).toBe(8200);

      // The design is linked to the deal.
      const links = await db
        .select()
        .from(crmDealDesigns)
        .where(eq(crmDealDesigns.dealId, dealId));
      expect(links.some((l) => l.designId === design.id)).toBe(true);

      // Requesting again reuses the same house deal (no duplicate).
      const r2 = await caller.crm.requestQuoteFromDesign({ designId: design.id });
      expect(r2.id).toBe(dealId);
      expect(r2.reused).toBe(true);
    } finally {
      await cleanup(dealId ? [dealId] : [], [design.id]);
    }
  });

  it("rejects a design the caller does not own", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(memberCtx());

    const ins = await db.insert(kitchenDesigns).values({
      userId: 999399,
      name: "Foreign Design RQ",
      roomData: { width: 100, depth: 100 },
      placedCabinets: [],
    });
    const foreignId = (ins as unknown as [{ insertId: number }])[0].insertId;

    try {
      await expect(
        caller.crm.requestQuoteFromDesign({ designId: foreignId }),
      ).rejects.toThrow();
    } finally {
      await cleanup([], [foreignId]);
    }
  });
});
