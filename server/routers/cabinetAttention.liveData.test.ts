import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

function adminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "cabinet-attention-regression-admin",
      name: "Cabinet Attention Regression Admin",
      email: "admin@example.com",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Cabinet Attention live data", () => {
  it("loads the review rows and their distributor dropdown values for an administrator", async () => {
    const caller = appRouter.createCaller(adminContext());
    const [review, distributors] = await Promise.all([
      caller.cabinets.adminListCabinetConfig({ page: 0, limit: 5, attentionOnly: true }),
      caller.cabinets.adminListAttentionDistributors(),
    ]);

    expect(review.total).toBeGreaterThan(0);
    expect(review.rows.length).toBeGreaterThan(0);
    expect(distributors.length).toBeGreaterThan(0);
    expect(distributors.map((line) => line.name)).toEqual(expect.arrayContaining(["Ashford", "Madison", "Preston"]));
  });

  it("returns only pending, unpublished distributor connections for connection review", async () => {
    const caller = appRouter.createCaller(adminContext());
    const result = await caller.cabinets.adminListPendingDistributorConnections({ limit: 10 });

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.items.every((item) => Boolean(item.distributorSku) && Boolean(item.masterCode))).toBe(true);
  });
});
