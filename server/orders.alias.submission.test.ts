import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import type { TrpcContext } from "./_core/context";
import { affiliateStyleBranding, affiliates, crmDeals, crmEvents, orderRequests } from "../drizzle/schema";

const REEVES_SLUG = "reaves-way-cabinet-shop";
const REEVES_CODE = "REAVESWAYCABINETSHOP";
const HICKORY_STYLE_ID = 330007;
const TEST_ALIAS = "Reeves Vitest Submission Alias";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

async function waitForCrmEvent(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  email: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const rows = await db
      .select({ payload: crmEvents.payload })
      .from(crmEvents)
      .where(and(eq(crmEvents.contactEmail, email), eq(crmEvents.eventType, "order_submitted")));
    if (rows[0]) return rows[0];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for submitted-order CRM event");
}

describe("orders.createRequest affiliate alias submission", () => {
  it("persists the affiliate alias in submitted order lines and CRM data", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const affiliate = await db
      .select({ id: affiliates.id })
      .from(affiliates)
      .where(eq(affiliates.slug, REEVES_SLUG))
      .limit(1);
    const affiliateId = affiliate[0]?.id;
    if (!affiliateId) throw new Error("Reeves Way affiliate fixture unavailable");
    const branding = await db
      .select({ brandName: affiliateStyleBranding.brandName })
      .from(affiliateStyleBranding)
      .where(and(eq(affiliateStyleBranding.affiliateId, affiliateId), eq(affiliateStyleBranding.styleId, HICKORY_STYLE_ID)))
      .limit(1);
    if (!branding[0]) throw new Error("Reeves Way Hickory style-branding fixture unavailable");

    const originalBrandName = branding[0].brandName;
    const email = `alias-submission-${Date.now()}@example.test`;
    let createdId: number | null = null;
    let createdDealId: number | null = null;
    try {
      await db
        .update(affiliateStyleBranding)
        .set({ brandName: TEST_ALIAS })
        .where(and(eq(affiliateStyleBranding.affiliateId, affiliateId), eq(affiliateStyleBranding.styleId, HICKORY_STYLE_ID)));

      const caller = appRouter.createCaller(publicCtx());
      const created = await caller.orders.createRequest({
        originatorName: "Alias Regression",
        originatorEmail: email,
        source: "manual",
        styleId: HICKORY_STYLE_ID,
        styleName: "Hickory Shaker",
        tier: "Homeowner",
        referralCode: REEVES_CODE,
        submit: true,
        lineItems: [{
          cabinetId: 9390025,
          masterCode: "CBLPN2",
          rawCode: "CBLPN2",
          description: "Corbel",
          qty: 1,
          unitPrice: 127.5,
          linePrice: 127.5,
          doorStyle: "Hickory Shaker",
          styleId: HICKORY_STYLE_ID,
          tier: "Homeowner",
          matched: true,
        }],
      });
      createdId = created.id;
      const saved = await db
        .select({ styleName: orderRequests.styleName, lineItems: orderRequests.lineItems, status: orderRequests.status })
        .from(orderRequests)
        .where(eq(orderRequests.id, created.id))
        .limit(1);
      expect(saved[0]?.status).toBe("submitted");
      expect(saved[0]?.styleName).toBe(TEST_ALIAS);
      expect(saved[0]?.lineItems[0]?.doorStyle).toBe(TEST_ALIAS);

      const deals = await db
        .select({ id: crmDeals.id, affiliateId: crmDeals.affiliateId, orderRequestId: crmDeals.orderRequestId, contactEmail: crmDeals.contactEmail })
        .from(crmDeals)
        .where(eq(crmDeals.orderRequestId, created.id))
        .limit(1);
      expect(deals[0]).toMatchObject({ affiliateId, orderRequestId: created.id, contactEmail: email });
      createdDealId = deals[0]?.id ?? null;

      const event = await waitForCrmEvent(db, email);
      expect((event.payload as { data?: { styleName?: string } }).data?.styleName).toBe(TEST_ALIAS);
    } finally {
      if (createdDealId != null) await db.delete(crmDeals).where(eq(crmDeals.id, createdDealId));
      await db.delete(crmEvents).where(eq(crmEvents.contactEmail, email));
      if (createdId != null) await db.delete(orderRequests).where(eq(orderRequests.id, createdId));
      await db
        .update(affiliateStyleBranding)
        .set({ brandName: originalBrandName })
        .where(and(eq(affiliateStyleBranding.affiliateId, affiliateId), eq(affiliateStyleBranding.styleId, HICKORY_STYLE_ID)));
    }
  });
});
