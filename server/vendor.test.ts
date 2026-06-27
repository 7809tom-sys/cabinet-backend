import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

function caller(user: any) {
  return appRouter.createCaller({ user } as any);
}

const ADMIN = { id: 1, role: "admin", openId: "admin1", name: "Owner", email: "owner@example.com" };
const USER = { id: 2, role: "user", openId: "u2", name: "Reg", email: "reg@example.com" };

describe("vendor router — admin gating", () => {
  it("rejects unauthenticated callers on adminList", async () => {
    await expect(caller(null).vendor.adminList()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects non-admin callers on adminList", async () => {
    await expect(caller(USER).vendor.adminList()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects non-admin callers on adminSetStatus", async () => {
    await expect(
      caller(USER).vendor.adminSetStatus({ id: 1, status: "approved" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows an admin to list vendor applications", async () => {
    const rows = await caller(ADMIN).vendor.adminList();
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe("vendor router — public application", () => {
  it("accepts a multi-category vendor application", async () => {
    const res = await caller(null).vendor.submitApplication({
      companyName: "Test Hardware Co",
      contactName: "Pat Vendor",
      email: "pat@example.com",
      categories: ["Cabinet Hardware", "Lighting"],
      hasCatalogImages: true,
      offersTradePricing: true,
    });
    expect(res).toHaveProperty("id");
    expect(typeof res.id).toBe("number");

    // Confirm the stored row carries the comma-joined categories.
    const rows = await caller(ADMIN).vendor.adminList();
    const created = rows.find((r) => r.id === res.id);
    expect(created).toBeTruthy();
    expect(created?.categories).toContain("Cabinet Hardware");
    expect(created?.categories).toContain("Lighting");

    // Clean up the test row so the table doesn't accumulate fixtures.
    await caller(ADMIN).vendor.adminSetStatus({
      id: res.id,
      status: "rejected",
      reviewNotes: "automated test row",
    });
  });

  it("rejects an application missing required fields", async () => {
    await expect(
      // @ts-expect-error intentionally missing required fields
      caller(null).vendor.submitApplication({ companyName: "X" }),
    ).rejects.toBeTruthy();
  });
});
