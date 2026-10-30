import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { contractorRecordUserId, requireContractorRecordUserId } from "./contractorRecordScope";
import { resolveScope } from "../routers/crm";

describe("contractor record scope", () => {
  it("keeps a contractor on their own id and lets any admin name another contractor", () => {
    expect(contractorRecordUserId({ id: 8, role: "contractor" })).toBe(8);
    expect(contractorRecordUserId({ id: 8, role: "contractor" }, 8)).toBe(8);
    expect(() => contractorRecordUserId({ id: 8, role: "contractor" }, 9)).toThrow(/Only an admin/);
    expect(() => contractorRecordUserId({ id: 3, role: "partner" }, 9)).toThrow(/Only an admin/);
    expect(contractorRecordUserId({ id: 2, role: "admin" }, 9)).toBe(9);
    expect(contractorRecordUserId({ id: 1, role: "admin" })).toBeNull();
    expect(requireContractorRecordUserId({ id: 2, role: "admin" }, 44)).toBe(44);
    expect(() => requireContractorRecordUserId({ id: 2, role: "admin" })).toThrow(/contractorUserId/);
    expect(() => requireContractorRecordUserId({ id: 3, role: "partner" })).toThrow(/Approved contractor access is required/);
  });

  it("resolves CRM scope from the admin role, not a specific account", async () => {
    const admin = { user: { id: 2, email: "rich@shop.test", role: "admin" } };
    await expect(resolveScope(admin)).resolves.toEqual({ kind: "house" });
    await expect(resolveScope(admin, { contractorUserId: 44 })).resolves.toEqual({ kind: "contractor", userId: 44 });
    const contractor = { user: { id: 44, email: "pat@shop.test", role: "contractor" } };
    await expect(resolveScope(contractor)).resolves.toEqual({ kind: "contractor", userId: 44 });
    await expect(resolveScope(contractor, { contractorUserId: 45 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("affiliate contractor markup SQL", () => {
  const sql = readFileSync("docs/sql/0238_affiliate_contractor_markups.tidb.sql", "utf8");

  it("is a hand-run TiDB script that follows 0237", () => {
    expect(sql).toContain("Run after 0237 and before deploying");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS cabinet_dealz.affiliate_contractor_markups");
    expect(sql).toContain("affiliateUserId INT NOT NULL PRIMARY KEY");
    expect(sql).toContain("markupBps INT NOT NULL");
    expect(sql).toContain("updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
    expect(sql).toContain("updatedByUserId INT NULL");
    expect(sql).not.toContain("statement-breakpoint");
    expect(sql).not.toMatch(/\bAS\s+(user|order|status|key)\b/i);
    expect(sql.match(/^-- \d+$/gm)).toEqual(["-- 1"]);
  });
});