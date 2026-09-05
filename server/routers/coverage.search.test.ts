import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

function adminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "coverage-search-regression-admin",
      name: "Coverage Search Regression Admin",
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

describe("Designer Coverage partial cabinet-code search", () => {
  it("normalizes separators before matching a partial master code", () => {
    const source = readFileSync(new URL("./catalog.ts", import.meta.url), "utf8");

    expect(source).toContain("adminDesignerCoverage: adminProcedure");
    expect(source).toContain("const normalizedCodeSearch = normalizeCode(search)");
    expect(source).toContain("UPPER(REPLACE(REPLACE(REPLACE(${cabinets.masterCode}, '-', ''), ' ', ''), '_', ''))");
    expect(source).toContain("${normalizedMasterCode} LIKE ${`%${normalizedCodeSearch}%`}");
  });

  it("finds an active separator-free master code when an administrator types a hyphenated partial code", async () => {
    const caller = appRouter.createCaller(adminContext());
    const result = await caller.cabinets.adminDesignerCoverage({ search: "B-24", gapsOnly: false });

    expect(result.cabinets.some((cabinet) => cabinet.masterCode === "B24")).toBe(true);
  });
});
