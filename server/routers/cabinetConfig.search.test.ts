import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { readFileSync } from "node:fs";

function adminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "cabinet-config-search-regression-admin",
      name: "Cabinet Config Search Regression Admin",
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

describe("Cabinet Configuration identifier search and distributor removal safeguards", () => {
  it("finds a canonical cabinet when searching an existing master SKU alias", async () => {
    const caller = appRouter.createCaller(adminContext());
    const result = await caller.cabinets.adminListCabinetConfig({ page: 0, limit: 10, search: "B-24" });

    expect(result.rows.some((row) => row.masterCode === "B24")).toBe(true);
  });

  it("retains master-code partial searching alongside aliases", async () => {
    const caller = appRouter.createCaller(adminContext());
    const result = await caller.cabinets.adminListCabinetConfig({ page: 0, limit: 10, search: "BFH2" });

    expect(result.rows.some((row) => row.masterCode === "BFH24")).toBe(true);
  });

  it("keeps the unlink operation administrator-only and preserves record history by disabling rather than deleting SKU rows", () => {
    const source = readFileSync(new URL("./catalog.ts", import.meta.url), "utf8");

    expect(source).toContain("adminRemoveCabinetDistributor: adminProcedure");
    expect(source).toContain("set({ isAvailable: false, isPublished: false })");
    expect(source).toContain("delete(cabinetDistributorEligibility)");
    expect(source).not.toContain("delete(distributorSkus)");
  });
});

