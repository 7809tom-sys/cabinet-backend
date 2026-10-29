import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { crmDeals, crmActivities, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// An approved contractor gets a CRM board scoped to the deals they own
// (crmDeals.ownerUserId = them). Self-serve promotion is closed. The
// distributor / admin ("house") sees ALL deals, including contractor deals.

function ctxFor(id: number, role: string, email: string): TrpcContext {
  return {
    user: { id, openId: `test-${id}`, name: `Test ${id}`, email, role },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

const CONTRACTOR_A = () => ctxFor(999210, "contractor", "contractor-a-test@example.com");
const CONTRACTOR_B = () => ctxFor(999211, "contractor", "contractor-b-test@example.com");
const ADMIN = () => ctxFor(999212, "admin", "house-admin-test@example.com");

async function cleanup(dealIds: number[]) {
  const db = await getDb();
  if (!db) return;
  for (const id of dealIds) {
    await db.delete(crmActivities).where(eq(crmActivities.dealId, id));
    await db.delete(crmDeals).where(eq(crmDeals.id, id));
  }
}

describe("contractor role — CRM scope (deals they own)", () => {
  it("a contractor's board resolves to the contractor scope and only shows their own deals", async () => {
    const db = await getDb();
    if (!db) return; // empty DB env — skip
    const a = appRouter.createCaller(CONTRACTOR_A());
    const b = appRouter.createCaller(CONTRACTOR_B());

    const board = await a.crm.board();
    expect(board.scope).toBe("contractor");

    const { id: dealA } = await a.crm.create({
      title: "Smith Residence — Kitchen",
      contactName: "J. Smith",
      estimatedValue: 12000,
    });
    const { id: dealB } = await b.crm.create({
      title: "Jones Residence — Bath",
      contactName: "M. Jones",
      estimatedValue: 6000,
    });

    try {
      // A sees only their own deal; B's deal is not visible to A.
      const aBoard = await a.crm.board();
      const aIds = aBoard.deals.map((d) => d.id);
      expect(aIds).toContain(dealA);
      expect(aIds).not.toContain(dealB);

      // A contractor cannot open a deal they don't own.
      await expect(a.crm.deal({ id: dealB })).rejects.toThrow();

      // Contractor-created deals are house-visible (affiliateId null, owned by them).
      const detail = await a.crm.deal({ id: dealA });
      expect(detail.deal.affiliateId).toBeNull();
      expect(detail.deal.ownerUserId).toBe(999210);
    } finally {
      await cleanup([dealA, dealB]);
    }
  });

  it("the house (admin/distributor) board sees ALL deals, including contractor deals", async () => {
    const db = await getDb();
    if (!db) return;
    const a = appRouter.createCaller(CONTRACTOR_A());
    const admin = appRouter.createCaller(ADMIN());

    const { id: contractorDeal } = await a.crm.create({
      title: "Contractor Deal — House Visibility",
      contactName: "Visible To House",
      estimatedValue: 4200,
    });

    try {
      const houseBoard = await admin.crm.board();
      expect(houseBoard.scope).toBe("house");
      const houseIds = houseBoard.deals.map((d) => d.id);
      expect(houseIds).toContain(contractorDeal);

      // House can open + manage the contractor's deal (distributor follow-up).
      const detail = await admin.crm.deal({ id: contractorDeal });
      expect(detail.deal.id).toBe(contractorDeal);
      await admin.crm.moveStage({ id: contractorDeal, stage: "contacted" });
      const moved = await admin.crm.deal({ id: contractorDeal });
      expect(moved.deal.stage).toBe("contacted");
    } finally {
      await cleanup([contractorDeal]);
    }
  });

  it("contractors do not import platform leads", async () => {
    const db = await getDb();
    if (!db) return;
    const a = appRouter.createCaller(CONTRACTOR_A());
    const leads = await a.crm.importableLeads();
    expect(leads.orderRequests).toEqual([]);
    expect(leads.proApplications).toEqual([]);
  });
});

describe("becomeContractor — self-serve role upgrade is closed", () => {
  it("refuses to promote a customer without an admin approval", async () => {
    const caller = appRouter.createCaller(ctxFor(999301, "user", "pending@example.com"));
    await expect(caller.customers.becomeContractor()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
