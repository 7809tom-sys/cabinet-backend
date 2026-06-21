import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

function caller(user: any) {
  return appRouter.createCaller({ user } as any);
}

const ADMIN = { id: 1, role: "admin", openId: "admin1", name: "Owner", email: "owner@example.com" };
const USER = { id: 2, role: "user", openId: "u2", name: "Reg", email: "reg@example.com" };

describe("customers admin router", () => {
  it("rejects unauthenticated callers on list", async () => {
    // adminProcedure gates on role, so a null user is rejected as FORBIDDEN.
    await expect(caller(null).customers.list({ page: 1, pageSize: 10 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects non-admin callers on list", async () => {
    await expect(caller(USER).customers.list({ page: 1, pageSize: 10 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects non-admin callers on setTier", async () => {
    await expect(
      caller(USER).customers.setTier({ userId: 99, tier: "contractor" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin can list customers and gets tier counts", async () => {
    const res = await caller(ADMIN).customers.list({ page: 1, pageSize: 10 });
    expect(res).toHaveProperty("rows");
    expect(res).toHaveProperty("total");
    expect(res.counts).toHaveProperty("homeowner");
    expect(res.counts).toHaveProperty("contractor");
    expect(res.counts).toHaveProperty("wholesale");
    expect(Array.isArray(res.rows)).toBe(true);
  });

  it("setTier on a missing user returns NOT_FOUND", async () => {
    await expect(
      caller(ADMIN).customers.setTier({ userId: 99999999, tier: "wholesale" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an invalid tier value", async () => {
    await expect(
      caller(ADMIN).customers.setTier({ userId: 1, tier: "platinum" as any }),
    ).rejects.toBeTruthy();
  });
});
