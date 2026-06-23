import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { crmDeals, crmActivities, crmDealDesigns, kitchenDesigns } from "../drizzle/schema";
import { eq } from "drizzle-orm";

function adminCtx(): TrpcContext {
  return {
    user: { id: 999101, openId: "test-admin-dl", name: "Test Admin DL", email: "admin-dl-test@example.com", role: "admin" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

async function cleanup(dealId: number, designIds: number[]) {
  const db = await getDb();
  if (!db) return;
  await db.delete(crmDealDesigns).where(eq(crmDealDesigns.dealId, dealId));
  await db.delete(crmActivities).where(eq(crmActivities.dealId, dealId));
  await db.delete(crmDeals).where(eq(crmDeals.id, dealId));
  for (const id of designIds) {
    await db.delete(kitchenDesigns).where(eq(kitchenDesigns.id, id));
  }
}

describe("crm router — design linking", () => {
  it("links a saved design to a deal, lists it, dedupes, and unlinks", async () => {
    const db = await getDb();
    if (!db) return; // empty DB env — skip
    const caller = appRouter.createCaller(adminCtx());

    // Create a saved design owned by the admin caller.
    const design = await caller.design.save({
      name: "Spec Design — CRM Link",
      roomData: { width: 120, depth: 120 },
      placedCabinets: [],
    });
    expect(design.id).toBeGreaterThan(0);

    // Create a house deal.
    const { id: dealId } = await caller.crm.create({
      title: "Deal — Design Link Spec",
      estimatedValue: 5000,
    });

    try {
      // The design shows up as linkable for its owner.
      const linkable = await caller.crm.linkableDesigns();
      expect(linkable.some((d) => d.id === design.id)).toBe(true);

      // Link it.
      const r1 = await caller.crm.linkDesign({ dealId, designId: design.id });
      expect(r1.ok).toBe(true);

      // The deal now reports the linked design with a snapshot name.
      const detail = await caller.crm.deal({ id: dealId });
      const link = detail.linkedDesigns.find((l) => l.designId === design.id);
      expect(link).toBeTruthy();
      expect(link?.designName).toBe("Spec Design — CRM Link");

      // Linking the same design again is idempotent (no duplicate row).
      const r2 = await caller.crm.linkDesign({ dealId, designId: design.id });
      expect(r2.alreadyLinked).toBe(true);
      const detail2 = await caller.crm.deal({ id: dealId });
      expect(detail2.linkedDesigns.filter((l) => l.designId === design.id).length).toBe(1);

      // Unlink it.
      await caller.crm.unlinkDesign({ dealId, linkId: link!.id });
      const detail3 = await caller.crm.deal({ id: dealId });
      expect(detail3.linkedDesigns.some((l) => l.designId === design.id)).toBe(false);
    } finally {
      await caller.crm.remove({ id: dealId }).catch(() => {});
      await cleanup(dealId, [design.id]);
    }
  });

  it("rejects linking a design the caller does not own", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());

    // Insert a design owned by a DIFFERENT user directly.
    const otherUserId = 999199;
    const ins = await db.insert(kitchenDesigns).values({
      userId: otherUserId,
      name: "Foreign Design",
      roomData: { width: 100, depth: 100 },
      placedCabinets: [],
    });
    const foreignId = (ins as unknown as [{ insertId: number }])[0].insertId;

    const { id: dealId } = await caller.crm.create({ title: "Deal — Foreign Design", estimatedValue: 1 });

    try {
      await expect(caller.crm.linkDesign({ dealId, designId: foreignId })).rejects.toThrow();
    } finally {
      await caller.crm.remove({ id: dealId }).catch(() => {});
      await cleanup(dealId, [foreignId]);
    }
  });
});
