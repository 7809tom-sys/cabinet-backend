import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { crmDeals, orderRequests } from "../drizzle/schema";

function adminContext(host = "www.cabinetdealz.com"): TrpcContext {
  return {
    user: { id: 1, openId: "crm-address-test", name: "CRM Address Test", email: "crm-address-test@example.com", role: "admin" },
    req: { protocol: "https", headers: { host } } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

describe("checkout address and CRM order import", () => {
  it("copies the complete saved delivery address into the CRM deal location", { timeout: 30_000 }, async () => {
    const db = await getDb();
    if (!db) return;
    const requestNumber = `E2E-CRM-${Date.now()}`;
    const inserted = await db.insert(orderRequests).values({
      requestNumber,
      originatorName: "Playwright CRM Address Test",
      originatorEmail: "playwright-crm@example.com",
      originatorPhone: "9415550199",
      zip: "34229",
      shippingAddressLine1: "123 Test Avenue",
      shippingAddressLine2: "Suite 4",
      shippingCity: "Osprey",
      shippingState: "FL",
      source: "manual",
      status: "submitted",
      lineItems: [],
      itemCount: 0,
      totalAmount: "0.00",
    });
    const orderId = (inserted as unknown as [{ insertId: number }])[0].insertId;
    let dealId = 0;
    try {
      const caller = appRouter.createCaller(adminContext());
      const result = await caller.crm.importLead({ type: "order_request", id: orderId });
      dealId = result.id;
      const [deal] = await db.select({ location: crmDeals.location, orderRequestId: crmDeals.orderRequestId })
        .from(crmDeals)
        .where(eq(crmDeals.id, dealId));
      expect(deal?.orderRequestId).toBe(orderId);
      expect(deal?.location).toBe("123 Test Avenue, Suite 4, Osprey, FL, 34229");
    } finally {
      if (dealId) await db.delete(crmDeals).where(eq(crmDeals.id, dealId));
      await db.delete(orderRequests).where(eq(orderRequests.id, orderId));
    }
  });
});

describe("staging checkout safety", () => {
  it("rejects submitted order creation on the staging host", async () => {
    const caller = appRouter.createCaller(adminContext("cabinetz-dq7pucbp.manus.space"));
    await expect(caller.orders.createRequest({
      source: "manual",
      storeScope: "owner",
      submit: true,
      lineItems: [{
        cabinetId: null,
        masterCode: "B12",
        rawCode: "B12",
        description: "Test cabinet",
        qty: 1,
        unitPrice: 1,
        linePrice: 1,
        matched: true,
      }],
    })).rejects.toThrow(/Staging test mode/i);
  });
});
