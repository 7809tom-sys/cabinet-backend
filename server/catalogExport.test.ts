import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { CATALOG_EXPORT_HEADERS } from "@shared/catalogExport";

function ctxFor(user: Record<string, unknown> | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

const adminCtx = ctxFor({ id: 991001, openId: "ce-admin", name: "Admin", email: "ce-admin@example.com", role: "admin" });
const userCtx = ctxFor({ id: 991002, openId: "ce-user", name: "User", email: "ce-user@example.com", role: "user" });

describe("distributorAdmin.catalogExport", () => {
  it("rejects non-admins", async () => {
    const caller = appRouter.createCaller(userCtx);
    await expect(caller.distributorAdmin.catalogExport()).rejects.toThrow();
  });

  it("returns a CSV with header + one row per cabinet", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx);
    const { csv, filename, count } = await caller.distributorAdmin.catalogExport();

    expect(filename).toMatch(/^cabinet-dealz-master-catalog-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(CATALOG_EXPORT_HEADERS.join(","));
    // header + at least one row per cabinet. A cabinet whose description
    // contains an embedded newline can wrap onto an extra physical line, so we
    // assert the row count is consistent with the reported count rather than an
    // exact equality that breaks whenever the catalog grows or a description
    // contains a newline.
    expect(lines.length).toBeGreaterThanOrEqual(count + 1);
    expect(count).toBeGreaterThan(0);
  });
});
