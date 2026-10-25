import { afterAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import type { TrpcContext } from "./_core/context";
import { orderRequests, orderShipments } from "../drizzle/schema";

function ctxFor(user: Record<string, unknown> | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

const PELICAN_LINE = 1; // vendor_lines.id, sourceKey "pelican"
const SKYLINE = 180001; // distributors.id
const HARDWARE = 300001; // distributors.id (code HRDW)

const plainUser = ctxFor({ id: 990201, openId: "vf-user", name: "U", email: "vf-user@example.invalid", role: "user" });
const admin = ctxFor({ id: 990202, openId: "vf-admin", name: "A", email: "vf-admin@example.invalid", role: "admin" });
const pelicanVendor = ctxFor({ id: 990203, openId: "vf-pel", name: "P", email: "vf-pel@example.invalid", role: "distributor", distributorId: null, approvedVendorLineId: PELICAN_LINE });
const skylineVendor = ctxFor({ id: 990204, openId: "vf-sky", name: "S", email: "vf-sky@example.invalid", role: "distributor", distributorId: SKYLINE, approvedVendorLineId: null });
const hardwareVendor = ctxFor({ id: 990205, openId: "vf-hw", name: "H", email: "vf-hw@example.invalid", role: "distributor", distributorId: HARDWARE, approvedVendorLineId: null });
const unlinkedVendor = ctxFor({ id: 990206, openId: "vf-none", name: "N", email: "vf-none@example.invalid", role: "distributor", distributorId: null, approvedVendorLineId: null });

const PREFIX = "VF-TEST-";

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  const leftovers = await db.select({ id: orderRequests.id }).from(orderRequests).where(like(orderRequests.requestNumber, `${PREFIX}%`));
  for (const row of leftovers) {
    await db.delete(orderShipments).where(eq(orderShipments.orderRequestId, row.id));
    await db.delete(orderRequests).where(eq(orderRequests.id, row.id));
  }
});

describe("vendorFulfillment access control", () => {
  it("rejects signed-out users, plain users and vendor accounts with no link", async () => {
    await expect(appRouter.createCaller(ctxFor(null)).vendorFulfillment.queue({ scope: "pelican" })).rejects.toThrow();
    await expect(appRouter.createCaller(plainUser).vendorFulfillment.queue({ scope: "pelican" })).rejects.toThrow();
    await expect(appRouter.createCaller(unlinkedVendor).vendorFulfillment.queue({ scope: "pelican" })).rejects.toThrow();
  });

  it("lets Pelican see only Pelican, a cabinet line only its own line, admins anything", async () => {
    const db = await getDb();
    if (!db) return;
    await expect(appRouter.createCaller(pelicanVendor).vendorFulfillment.queue({ scope: "pelican" })).resolves.toBeInstanceOf(Array);
    await expect(appRouter.createCaller(pelicanVendor).vendorFulfillment.queue({ scope: `dist:${SKYLINE}` })).rejects.toThrow(/not linked/i);
    await expect(appRouter.createCaller(skylineVendor).vendorFulfillment.queue({ scope: "pelican" })).rejects.toThrow(/not linked/i);
    await expect(appRouter.createCaller(skylineVendor).vendorFulfillment.queue({ scope: `dist:${SKYLINE}` })).resolves.toBeInstanceOf(Array);
    await expect(appRouter.createCaller(admin).vendorFulfillment.queue({ scope: "pelican" })).resolves.toBeInstanceOf(Array);
    await expect(appRouter.createCaller(admin).vendorFulfillment.queue({ scope: `dist:${HARDWARE}` })).resolves.toBeInstanceOf(Array);
  });

  it("rejects malformed scopes before touching data", async () => {
    for (const scope of ["dist:", "dist:0", "dist:1 OR 1=1", "PELICAN", "../pelican"]) {
      await expect(appRouter.createCaller(admin).vendorFulfillment.queue({ scope })).rejects.toThrow(/unknown vendor/i);
    }
  });
});

describe("vendorFulfillment queue and shipping on a mixed order", () => {
  it("splits items by vendor, holds shipping until the order rail releases, and ships each vendor independently", async () => {
    const db = await getDb();
    if (!db) return;
    const requestNumber = `${PREFIX}${Date.now()}`;
    const result = await db.insert(orderRequests).values({
      requestNumber,
      status: "confirmed",
      paidAt: new Date(),
      stripePaymentIntentId: "pi_synthetic_vf_test",
      orderRailStatus: "affiliate_review",
      distributorId: SKYLINE,
      originatorName: "Synthetic Test Customer",
      shippingAddressLine1: "1 Test Way",
      shippingCity: "Tampa",
      shippingState: "FL",
      zip: "33602",
      itemCount: 3,
      totalAmount: "4321.00",
      lineItems: [
        { cabinetId: 1, masterCode: "B30", description: "Base cabinet 30", qty: 2, unitPrice: 111, linePrice: 222, distributorId: SKYLINE, doorStyle: "Shaker", matched: true },
        { cabinetId: null, masterCode: "Apollo 3cm", description: "Quartz slab", qty: 1, unitPrice: 999, linePrice: 999, productKind: "surface", matched: true },
      ],
    });
    const orderId = (result as unknown as [{ insertId: number }])[0].insertId;
    try {
      const pel = appRouter.createCaller(pelicanVendor).vendorFulfillment;
      const sky = appRouter.createCaller(skylineVendor).vendorFulfillment;
      const hw = appRouter.createCaller(hardwareVendor).vendorFulfillment;

      // Paid but still in affiliate review: visible as upcoming, each vendor sees only its own items.
      const pelQueue = (await pel.queue({ scope: "pelican" })).find((o) => o.orderId === orderId);
      const skyQueue = (await sky.queue({ scope: `dist:${SKYLINE}` })).find((o) => o.orderId === orderId);
      expect(pelQueue?.stage).toBe("upcoming");
      expect(pelQueue?.stageLabel).toBe("Waiting for Cabinet Dealz to release this order");
      expect(pelQueue?.items.map((i) => i.sku)).toEqual(["Apollo 3cm"]);
      expect(skyQueue?.items.map((i) => i.sku)).toEqual(["B30"]);
      expect((await hw.queue({ scope: `dist:${HARDWARE}` })).some((o) => o.orderId === orderId)).toBe(false);

      // No money, margin or other-vendor data leaves the server.
      const serialized = JSON.stringify(pelQueue);
      for (const secret of ["4321", "999", "111", "totalAmount", "unitPrice", "linePrice", "stripe", "B30", "Base cabinet"]) {
        expect(serialized).not.toContain(secret);
      }

      // Cannot ship or print before release.
      await expect(pel.markShipped({ scope: "pelican", orderId, carrier: "UPS", trackingNumber: "1Z999AA10123456784" })).rejects.toThrow(/not ready to ship/i);
      await expect(pel.markLabelPrinted({ scope: "pelican", orderId })).rejects.toThrow(/not ready to ship/i);

      // Release the order the way the rail does.
      await db.update(orderRequests).set({ orderRailStatus: "fulfillment_authorized" }).where(eq(orderRequests.id, orderId));
      expect((await pel.queue({ scope: "pelican" })).find((o) => o.orderId === orderId)?.stage).toBe("ready");

      // A vendor with no items on this order cannot probe or ship it.
      await expect(hw.markShipped({ scope: `dist:${HARDWARE}`, orderId, carrier: "UPS", trackingNumber: "1Z999AA10123456784" })).rejects.toThrow(/no items from your catalog/i);
      // Nor can Pelican act on Skyline's scope.
      await expect(pel.markShipped({ scope: `dist:${SKYLINE}`, orderId, carrier: "UPS", trackingNumber: "1Z999AA10123456784" })).rejects.toThrow(/not linked/i);

      // Required fields are enforced.
      await expect(pel.markShipped({ scope: "pelican", orderId, carrier: "UPS", trackingNumber: "" })).rejects.toThrow(/tracking number/i);
      await expect(pel.markShipped({ scope: "pelican", orderId, carrier: "", trackingNumber: "1Z999AA10123456784" })).rejects.toThrow(/carrier/i);

      // Label print is remembered, then Pelican ships.
      await pel.markLabelPrinted({ scope: "pelican", orderId });
      const first = await pel.markShipped({ scope: "pelican", orderId, carrier: "UPS", trackingNumber: " 1z 999 aa1 0123 456 784 ", packageCount: 2, notes: "Left dock 9am" });
      expect(first.firstShip).toBe(true);
      const afterFirst = (await pel.queue({ scope: "pelican" })).find((o) => o.orderId === orderId)!;
      expect(afterFirst.shipment).toMatchObject({ status: "shipped", carrier: "UPS", trackingNumber: "1Z999AA10123456784", packageCount: 2, notes: "Left dock 9am" });
      expect(afterFirst.shipment?.labelPrintedAt).toBeTruthy();
      const shippedAt = afterFirst.shipment!.shippedAt!.getTime();

      // Skyline's part is still pending: shipping Pelican's boxes did not ship the cabinets.
      expect((await sky.queue({ scope: `dist:${SKYLINE}` })).find((o) => o.orderId === orderId)?.shipment?.status ?? "pending").toBe("pending");

      // Correcting a typo never creates a second shipment or moves shippedAt.
      const fix = await pel.markShipped({ scope: "pelican", orderId, carrier: "FedEx", trackingNumber: "123456789012", packageCount: 2 });
      expect(fix.firstShip).toBe(false);
      const afterFix = (await pel.queue({ scope: "pelican" })).find((o) => o.orderId === orderId)!;
      expect(afterFix.shipment).toMatchObject({ carrier: "FedEx", trackingNumber: "123456789012" });
      expect(afterFix.shipment!.shippedAt!.getTime()).toBe(shippedAt);
      const rows = await db.select().from(orderShipments).where(eq(orderShipments.orderRequestId, orderId));
      expect(rows.filter((r) => r.vendorScope === "pelican")).toHaveLength(1);

      // Skyline ships its own boxes independently, with its own tracking.
      const skyShip = await sky.markShipped({ scope: `dist:${SKYLINE}`, orderId, carrier: "LTL freight", trackingNumber: "PRO-778899" });
      expect(skyShip.firstShip).toBe(true);
      const all = await db.select().from(orderShipments).where(eq(orderShipments.orderRequestId, orderId));
      expect(all.map((r) => r.vendorScope).sort()).toEqual([`dist:${SKYLINE}`, "pelican"]);
    } finally {
      await db.delete(orderShipments).where(eq(orderShipments.orderRequestId, orderId));
      await db.delete(orderRequests).where(eq(orderRequests.id, orderId));
    }
  }, 60_000);
});

describe("Pelican catalog access follows the approved vendor record", () => {
  it("lets the Pelican vendor account in and keeps every other vendor out", async () => {
    const db = await getDb();
    if (!db) return;
    await expect(appRouter.createCaller(pelicanVendor).pelican.adminList({ limit: 1, offset: 0 })).resolves.toBeDefined();
    await expect(appRouter.createCaller(skylineVendor).pelican.adminList({ limit: 1, offset: 0 })).rejects.toThrow(/only available to the Pelican vendor/i);
    await expect(appRouter.createCaller(hardwareVendor).pelican.adminList({ limit: 1, offset: 0 })).rejects.toThrow(/only available to the Pelican vendor/i);
    await expect(appRouter.createCaller(plainUser).pelican.adminList({ limit: 1, offset: 0 })).rejects.toThrow();
  });
});
