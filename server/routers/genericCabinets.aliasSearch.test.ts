import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

function adminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "generic-catalog-alias-search-admin",
      name: "Generic Catalog Alias Search Admin",
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

describe("Generic Catalog alias search", () => {
  it("returns the canonical AW1230 result and identifies AW-12-30 as the searched alias", async () => {
    const caller = appRouter.createCaller(adminContext());
    const result = await caller.genericCabinets.list({
      search: "AW-12-30",
      page: 1,
      pageSize: 20,
    });

    const canonical = result.rows.find((row) => row.masterCode === "AW1230");
    expect(canonical).toMatchObject({
      masterCode: "AW1230",
      matchedAlias: "AW-12-30",
    });
    expect(result.rows.some((row) => row.masterCode === "AW-12-30")).toBe(false);
  });
});
