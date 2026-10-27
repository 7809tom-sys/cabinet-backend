import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import { assertVendorFeature } from "./lib/vendorFeatureAccess";

const rows = vi.hoisted(() => ({
  vendor: { isCabinetVendor: false as boolean | null, isApproved: true },
}));

vi.mock("./db", () => ({
  getDb: async () => ({
    select: () => ({
      from: () => {
        const query = {
          where: () => ({
            limit: async () => [rows.vendor],
          }),
          then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve([]).then(resolve, reject),
        };
        return query;
      },
    }),
  }),
}));

function ctxFor(user: Record<string, unknown>): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

describe("cabinet-only supplier endpoints", () => {
  it("rejects the feature directly when the vendor is not a cabinet vendor", () => {
    expect(() => assertVendorFeature({ isCabinetVendor: false }, "featured_styles")).toThrow(TRPCError);
    expect(() => assertVendorFeature({ isCabinetVendor: false }, "door_styles")).toThrow(/cabinet-only/i);
    expect(() => assertVendorFeature({ isCabinetVendor: null }, "designer_eligibility")).toThrow(/cabinet-only/i);
    expect(() => assertVendorFeature({ isCabinetVendor: true }, "featured_styles")).not.toThrow();
    expect(() => assertVendorFeature({ isCabinetVendor: false }, "promotions")).not.toThrow();
    expect(() => assertVendorFeature({ isCabinetVendor: false }, "sales_forecast")).not.toThrow();
    expect(() => assertVendorFeature({ isCabinetVendor: false }, "shipping_fulfillment")).not.toThrow();
  });

  it("denies a non-cabinet vendor on the featured-styles endpoint before cabinet data is read", async () => {
    rows.vendor = { isCabinetVendor: false, isApproved: true };
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(ctxFor({
      id: 42,
      openId: "non-cabinet",
      name: "Pelican",
      email: "pelican@example.com",
      role: "distributor",
      distributorId: 9,
      approvedVendorLineId: 5,
    }));
    await expect(caller.distributorPortal.featuredStyles()).rejects.toThrow(/cabinet-only supplier feature/i);
    await expect(caller.distributorPortal.getDesignToolPicks()).rejects.toThrow(/cabinet-only supplier feature/i);
    await expect(caller.distributorPortal.catalog({ limit: 1, offset: 0 })).rejects.toThrow(/cabinet-only supplier feature/i);
  });

  it("does not apply that denial to an administrator previewing a vendor", async () => {
    rows.vendor = { isCabinetVendor: false, isApproved: true };
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(ctxFor({
      id: 7,
      openId: "admin",
      name: "Admin",
      email: "admin@example.com",
      role: "admin",
      distributorId: null,
      approvedVendorLineId: null,
    }));
    await expect(caller.distributorPortal.featuredStyles({ distributorId: 9 })).rejects.not.toThrow(/cabinet-only supplier feature/i);
  });
});
