import { beforeEach, describe, expect, it, vi } from "vitest";
import { affiliates, crmDeals } from "../../drizzle/schema";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));

vi.mock("../db", () => ({
  getDb: getDbMock,
}));

import { crmRouter } from "./crm";

const affiliateDeal = {
  id: 91,
  affiliateId: 7,
  title: "Reaves Way kitchen plan",
  stage: "new",
  priority: "medium",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function masterBoardDb() {
  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === crmDeals) {
          return {
            orderBy: async () => [affiliateDeal],
          };
        }
        if (table === affiliates) {
          return Promise.resolve([{ id: 7, storeName: "Reaves Way Cabinet Shop." }]);
        }
        throw new Error("Unexpected table");
      },
    }),
  };
}

describe("crm.board master visibility", () => {
  beforeEach(() => {
    getDbMock.mockResolvedValue(masterBoardDb());
  });

  it("shows affiliate-owned deals in master CRM with the owning affiliate name", async () => {
    const caller = crmRouter.createCaller({
      user: { id: 1, email: "owner@example.com", role: "admin" },
    } as any);

    const result = await caller.board();

    expect(result.scope).toBe("house");
    expect(result.deals).toEqual([affiliateDeal]);
    expect(result.affiliateNames).toEqual({ 7: "Reaves Way Cabinet Shop." });
  });
});
