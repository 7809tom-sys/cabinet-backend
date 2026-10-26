import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function adminCtx(): TrpcContext {
  return {
    user: {
      id: 999401,
      openId: "test-admin-distmarkup",
      name: "Markup Admin",
      email: "admin-distmarkup-test@example.com",
      role: "admin",
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

function userCtx(): TrpcContext {
  return {
    user: {
      id: 999402,
      openId: "test-user-distmarkup",
      name: "Nobody",
      email: "user-distmarkup-test@example.com",
      role: "user",
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

describe("pricing — centralized tier rules", () => {
  it("keeps margin settings admin-only", async () => {
    const caller = appRouter.createCaller(userCtx());
    await expect(caller.pricing.adminGetMargins()).rejects.toThrow();
  });

  it("returns only the saved platform tier settings to administrators", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const result = await caller.pricing.adminGetMargins();
    expect(result.settings).toMatchObject({
      homeownerMarkupBps: expect.any(Number),
      contractorMarkupBps: expect.any(Number),
      wholesaleMarkupBps: expect.any(Number),
    });
    expect(result).not.toHaveProperty("distributors");
  });

  it("does not expose a per-distributor markup control that cannot alter price math", () => {
    const marginsAdmin = readFileSync(
      resolve(import.meta.dirname, "../client/src/components/admin/MarginsAdmin.tsx"),
      "utf8",
    );
    const catalogRouter = readFileSync(
      resolve(import.meta.dirname, "routers/catalog.ts"),
      "utf8",
    );
    expect(marginsAdmin).not.toContain("Per-supply-line markup overrides");
    expect(marginsAdmin).not.toContain("adminSetDistributorMarkup");
    expect(catalogRouter).not.toContain("adminSetDistributorMarkup:");
  });
});
