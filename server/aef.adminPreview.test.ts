import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { distributors, distributorSkus } from "../drizzle/schema";

function contextFor(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("AEF USCD frameless release", () => {
  it("shows the complete verified U.S. Cabinet Depot frameless line publicly with source-backed SCL and printed geometry", async () => {
    const db = await getDb();
    if (!db) return;
    const [aef] = await db.select({ id: distributors.id }).from(distributors).where(eq(distributors.code, "AEF")).limit(1);
    if (!aef) return;

    const publicCaller = appRouter.createCaller(contextFor(null));
    const adminCaller = appRouter.createCaller(contextFor({
      id: 1,
      openId: "admin-preview-test",
      name: "Admin Preview Test",
      email: "admin-preview-test@example.invalid",
      role: "admin",
      distributorId: null,
      approvedVendorLineId: null,
      passwordHash: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      loginMethod: "test",
      pricingTier: "homeowner",
      companyName: null,
      emailLower: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TrpcContext["user"]));

    const [publicBase, publicWall, publicTall, publicAll, adminBase, adminWall, adminTall, adminAll] = await Promise.all([
      publicCaller.design.placeableCabinets({ placement: "base", distributorId: aef.id, search: "B18" }),
      publicCaller.design.placeableCabinets({ placement: "wall", distributorId: aef.id, search: "W3012" }),
      publicCaller.design.placeableCabinets({ placement: "tall", distributorId: aef.id, search: "T1884" }),
      publicCaller.design.placeableCabinets({ distributorId: aef.id }),
      adminCaller.design.placeableCabinets({ placement: "base", distributorId: aef.id, search: "B18" }),
      adminCaller.design.placeableCabinets({ placement: "wall", distributorId: aef.id, search: "W3012" }),
      adminCaller.design.placeableCabinets({ placement: "tall", distributorId: aef.id, search: "T1884" }),
      adminCaller.design.placeableCabinets({ distributorId: aef.id }),
    ]);

    expect(publicBase.some((row) => row.masterCode === "B18")).toBe(true);
    expect(publicWall.some((row) => row.masterCode === "W3012")).toBe(true);
    expect(publicTall.some((row) => row.masterCode === "T1884")).toBe(true);
    expect(adminBase.some((row) => row.masterCode === "B18")).toBe(true);
    expect(adminWall.some((row) => row.masterCode === "W3012")).toBe(true);
    expect(adminTall.some((row) => row.masterCode === "T1884")).toBe(true);
    // 115 initially released verified cabinet models + 151 source-backed
    // complete-line cabinet models. Accessories remain in their own tab.
    expect(publicAll).toHaveLength(266);
    expect(adminAll).toHaveLength(266);
    expect(publicBase.find((row) => row.masterCode === "B18")).toMatchObject({ height: "34.75", depth: "24.00", numberOfDoors: 1, numberOfDrawers: 1 });
    expect(publicWall.find((row) => row.masterCode === "W3012")).toMatchObject({ height: "12.63", depth: "13.50", numberOfDoors: 1 });
    expect(publicAll.some((row) => row.masterCode === "B18FH")).toBe(true);
    expect(publicAll.some((row) => row.masterCode === "B24S")).toBe(true);

    const [publicStyles, adminStyles, publicLines, adminLines] = await Promise.all([
      publicCaller.doorStyles.list({ distributorId: aef.id }),
      adminCaller.doorStyles.list({ distributorId: aef.id }),
      publicCaller.distributors.list(),
      adminCaller.distributors.list(),
    ]);
    expect(publicStyles).toHaveLength(49);
    expect(publicLines.some((row) => row.code === "AEF")).toBe(true);
    expect(adminStyles).toHaveLength(49);
    expect(publicStyles.find((row) => row.styleCode === "SCL")?.doorSampleImageUrl).toContain("SCL_cd4802db.png");
    expect(adminLines.some((row) => row.code === "AEF")).toBe(true);

    const publishedState = await db
      .select({ id: distributorSkus.id, isPublished: distributorSkus.isPublished, geometryStatus: distributorSkus.geometryStatus })
      .from(distributorSkus)
      .where(and(
        eq(distributorSkus.distributorId, aef.id),
        eq(distributorSkus.isPublished, true),
      ))
      ;
    // Existing 115 × 49 finish rows + complete-line source rows (7,778).
    expect(publishedState).toHaveLength(13_413);
    expect(publishedState.every((row) => row.geometryStatus === "verified" && row.isPublished)).toBe(true);
  });
});
