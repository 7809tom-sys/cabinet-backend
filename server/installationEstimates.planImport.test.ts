import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  affiliateInstallationEstimates,
  affiliateTeamMembers,
  affiliates,
  cabinets,
  crmActivities,
  crmDealDesigns,
  crmDeals,
  kitchenDesigns,
} from "../drizzle/schema";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));

vi.mock("./db", () => ({ getDb: getDbMock }));

import { installationEstimatesRouter } from "./routers/installationEstimates";

type State = {
  affiliates: Array<Record<string, any>>;
  affiliateTeamMembers: Array<Record<string, any>>;
  kitchenDesigns: Array<Record<string, any>>;
  cabinets: Array<Record<string, any>>;
  affiliateInstallationEstimates: Array<Record<string, any>>;
  crmDeals: Array<Record<string, any>>;
  crmDealDesigns: Array<Record<string, any>>;
  crmActivities: Array<Record<string, any>>;
  failDesignLink?: boolean;
};

let db: ReturnType<typeof fakeDb>;

function project(rows: Array<Record<string, any>>, fields?: Record<string, unknown>) {
  if (!fields) return rows.map((row) => ({ ...row }));
  return rows.map((row) => Object.fromEntries(Object.keys(fields).map((key) => [key, row[key]])));
}

function tableRows(state: State, table: unknown): Array<Record<string, any>> {
  if (table === affiliates) return state.affiliates;
  if (table === affiliateTeamMembers) return state.affiliateTeamMembers;
  if (table === kitchenDesigns) return state.kitchenDesigns;
  if (table === cabinets) return state.cabinets;
  if (table === affiliateInstallationEstimates) return state.affiliateInstallationEstimates;
  if (table === crmDeals) return state.crmDeals;
  if (table === crmDealDesigns) return state.crmDealDesigns;
  if (table === crmActivities) return state.crmActivities;
  throw new Error("Unexpected table in installation-estimate fake DB");
}

/** Minimal fluent Drizzle fake: query predicates are pre-scoped by each fixture. */
function fakeDb(state: State) {
  let transactions = 0;

  const makeDb = (active: State, inTransaction: boolean) => ({
    select: (fields?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        let rows = tableRows(active, table);
        const chain: any = {
          where: () => chain,
          orderBy: () => chain,
          limit: (count: number) => augmented(rows.slice(0, count), fields),
          for: () => augmented(rows, fields),
          innerJoin: (joinTable: unknown) => {
            if (table !== crmDealDesigns || joinTable !== crmDeals) throw new Error("Unexpected join");
            rows = active.crmDealDesigns
              .map((link) => active.crmDeals.find((deal) => deal.id === link.dealId))
              .filter((deal): deal is Record<string, any> => Boolean(deal));
            return chain;
          },
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(project(rows, fields))),
        };
        return chain;
      },
    }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, any>) => {
        if (table === crmDealDesigns && active.failDesignLink) throw new Error("CRM design link failed");
        const rows = tableRows(active, table);
        const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
        rows.push({ id, ...values, __transaction: inTransaction });
        return [{ insertId: id }];
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, any>) => ({
        where: async () => {
          const rows = tableRows(active, table);
          // Every update in this route targets the just-created estimate or the sole matching deal.
          const row = rows[rows.length - 1];
          if (row) Object.assign(row, values, { __transaction: inTransaction });
        },
      }),
    }),
  });

  function augmented(rows: Array<Record<string, any>>, fields?: Record<string, unknown>) {
    const result: any = project(rows, fields);
    result.for = () => result;
    return result;
  }

  const root: any = makeDb(state, false);
  root.transaction = async (work: (tx: any) => Promise<unknown>) => {
    transactions += 1;
    const staged = structuredClone(state) as State;
    const result = await work(makeDb(staged, true));
    for (const key of Object.keys(state) as Array<keyof State>) state[key] = staged[key] as never;
    return result;
  };
  Object.defineProperty(root, "transactions", { get: () => transactions });
  return root;
}

function seed(overrides: Partial<State> = {}): State {
  return {
    affiliates: [{ id: 1, userId: 1, email: "owner@example.com" }],
    affiliateTeamMembers: [],
    kitchenDesigns: [{
      id: 101,
      affiliateId: 1,
      name: "Maple Kitchen",
      projectName: "Wilson remodel",
      roomLabel: "Kitchen",
      roomType: "Kitchen",
      updatedAt: new Date("2026-01-02"),
      placedCabinets: [
        { uid: "base", cabinetId: 1, qty: 2 },
        { uid: "wall", cabinetId: 2 },
        { uid: "tall", cabinetId: 3, qty: 3 },
        { uid: "accessory", cabinetId: 4, qty: 9 },
        { uid: "not-a-cabinet", cabinetId: 5, qty: 8 },
      ],
    }],
    cabinets: [
      { id: 1, category: "Base", placementType: "base", isNotCabinet: false },
      { id: 2, category: "Wall", placementType: "wall", isNotCabinet: false },
      { id: 3, category: "Tall", placementType: "tall", isNotCabinet: false },
      { id: 4, category: "Accessory", placementType: "base", isNotCabinet: false },
      { id: 5, category: "Base", placementType: "base", isNotCabinet: true },
    ],
    affiliateInstallationEstimates: [],
    crmDeals: [],
    crmDealDesigns: [],
    crmActivities: [],
    ...overrides,
  };
}

const owner = { id: 1, email: "owner@example.com", role: "user" };
const estimateInput = {
  roomType: "Kitchen" as const,
  kitchenDesignId: 101,
  customerName: "Jane Wilson",
  customerEmail: "jane@example.com",
  lineItems: [{ description: "Install cabinets", quantity: 1, unitCost: 125, costType: "labor" as const }],
};

function caller(user = owner) {
  return installationEstimatesRouter.createCaller({ user } as any);
}

beforeEach(() => {
  db = fakeDb(seed());
  getDbMock.mockReset();
  getDbMock.mockResolvedValue(db);
});

describe("installationEstimates plan import", () => {
  it("validates whole quantities before DB access, protects plan imports, and allows a CRM member's ordinary estimate", async () => {
    await expect(caller().create({ ...estimateInput, lineItems: [{ ...estimateInput.lineItems[0], quantity: 1.5 }] }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(getDbMock).not.toHaveBeenCalled();

    const state = seed({
      affiliateTeamMembers: [{ affiliateId: 1, userId: 22, email: "crm@example.com", isActive: true, accessCrm: true, accessDesigner: false }],
    });
    db = fakeDb(state);
    getDbMock.mockResolvedValue(db);
    const crmOnly = caller({ id: 22, email: "crm@example.com", role: "user" });

    await expect(crmOnly.create(estimateInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(crmOnly.create({ ...estimateInput, roomType: "Bathroom", kitchenDesignId: 101 })).resolves.toMatchObject({ kitchenDesignId: null });
    expect(state.affiliateInstallationEstimates).toHaveLength(1);

    const foreignPlanState = seed({ kitchenDesigns: [] });
    db = fakeDb(foreignPlanState);
    getDbMock.mockResolvedValue(db);
    await expect(caller().create(estimateInput)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(foreignPlanState.affiliateInstallationEstimates).toHaveLength(0);
  });

  it("lists saved kitchen plans with only real Base, Wall, and Tall cabinet quantities", async () => {
    const plans = await caller().kitchenPlans();

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      id: 101,
      name: "Maple Kitchen",
      cabinetBreakdown: { base: 2, wall: 1, tall: 3, total: 6 },
    });
  });

  it("creates the estimate, CRM deal, plan link, estimate CRM ID, and activity inside one transaction", async () => {
    const state = seed();
    db = fakeDb(state);
    getDbMock.mockResolvedValue(db);

    const result = await caller().create(estimateInput);

    expect(result).toMatchObject({ id: 1, crmDealId: 1, kitchenDesignId: 101, cabinetBreakdown: { base: 2, wall: 1, tall: 3, total: 6 } });
    expect(db.transactions).toBe(1);
    expect(state.affiliateInstallationEstimates[0]).toMatchObject({ id: 1, kitchenDesignId: 101, crmDealId: 1, __transaction: true });
    expect(state.crmDeals[0]).toMatchObject({ id: 1, affiliateId: 1, laborEstimateId: 1, __transaction: true });
    expect(state.crmDealDesigns).toEqual([expect.objectContaining({ dealId: 1, designId: 101, linkedByUserId: 1, __transaction: true })]);
    expect(state.crmActivities).toEqual([expect.objectContaining({ dealId: 1, authorUserId: 1, kind: "note", __transaction: true })]);
  });

  it("reuses an already plan-linked CRM deal without duplicate links and rolls all writes back when link creation fails", async () => {
    const reused = seed({
      crmDeals: [{ id: 9, affiliateId: 1, title: "Existing plan deal", updatedAt: new Date() }],
      crmDealDesigns: [{ id: 19, dealId: 9, designId: 101, designName: "Maple Kitchen", linkedByUserId: 1 }],
    });
    db = fakeDb(reused);
    getDbMock.mockResolvedValue(db);

    await expect(caller().create(estimateInput)).resolves.toMatchObject({ crmDealId: 9 });
    expect(reused.crmDeals).toHaveLength(1);
    expect(reused.crmDealDesigns).toHaveLength(1);
    expect(reused.affiliateInstallationEstimates[0]).toMatchObject({ crmDealId: 9 });

    const failed = seed({ failDesignLink: true });
    db = fakeDb(failed);
    getDbMock.mockResolvedValue(db);
    await expect(caller().create(estimateInput)).rejects.toThrow("CRM design link failed");
    expect(failed.affiliateInstallationEstimates).toEqual([]);
    expect(failed.crmDeals).toEqual([]);
    expect(failed.crmDealDesigns).toEqual([]);
    expect(failed.crmActivities).toEqual([]);
  });
});
