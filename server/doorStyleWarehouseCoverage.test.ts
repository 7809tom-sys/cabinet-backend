import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { distributors, doorStyles } from "../drizzle/schema";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";

const catalogSource = readFileSync(new URL("./routers/catalog.ts", import.meta.url), "utf8");
const portalSource = readFileSync(new URL("./routers/distributorPortal.ts", import.meta.url), "utf8");

function adminCtx(): TrpcContext {
  return {
    user: {
      id: 990221,
      openId: "warehouse-coverage-admin",
      name: "Warehouse Coverage Admin",
      email: "warehouse-coverage-admin@example.com",
      role: "admin",
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

describe("featured style editor warehouse coverage wiring", () => {
  it("joins vendor zips onto the featured-style editor lists and keeps empty saves empty", () => {
    for (const source of [catalogSource, portalSource]) {
      expect(source).toContain("distributorWarehouseZips: distributors.warehouseZips");
      expect(source).toContain("withDoorStyleWarehouseCoverage");
      expect(source).toContain("doorStyleOwnWarehouseZipWrite");
      expect(source).toContain("never copied onto door_styles");
    }
    expect(portalSource).toContain(".leftJoin(distributors, eq(doorStyles.distributorId, distributors.id))");
  });

  it("does not attach vendor coverage to the public featured row", () => {
    const publicFeatured = catalogSource.slice(
      catalogSource.indexOf("featured: publicProcedure"),
      catalogSource.indexOf("listForAdmin:"),
    );
    expect(publicFeatured.length).toBeGreaterThan(0);
    expect(publicFeatured).not.toContain("distributorWarehouseZips");
    expect(publicFeatured).not.toContain("withDoorStyleWarehouseCoverage");
  });
});

describe("featured style editor warehouse coverage routes", () => {
  it("inherits vendor zips when a style list is empty and keeps an explicit list as the style's own", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(adminCtx());
    const lines = await db.select({
      id: distributors.id,
      warehouseZips: distributors.warehouseZips,
    }).from(distributors).limit(12);
    let line: (typeof lines)[number] | undefined;
    let styleId: number | undefined;
    for (const candidate of lines) {
      const featured = await caller.distributorPortal.featuredStyles({ distributorId: candidate.id });
      const match = featured.styles[0];
      if (!match) continue;
      line = candidate;
      styleId = match.id;
      break;
    }
    if (!line || styleId == null) return;
    const style = { id: styleId };

    const [originalStyle] = await db.select({
      warehouseZip: doorStyles.warehouseZip,
      warehouseZips: doorStyles.warehouseZips,
    }).from(doorStyles).where(eq(doorStyles.id, style.id)).limit(1);
    if (!originalStyle) return;

    const vendorZips = ["75001", "30301"];
    try {
      await db.update(distributors).set({ warehouseZips: vendorZips }).where(eq(distributors.id, line.id));
      await db.update(doorStyles).set({ warehouseZip: null, warehouseZips: null }).where(eq(doorStyles.id, style.id));

      const inheritedVendor = await caller.distributorPortal.featuredStyles({ distributorId: line.id });
      const inheritedRow = inheritedVendor.styles.find((row) => row.id === style.id);
      expect(inheritedRow).toMatchObject({
        warehouseZip: null,
        warehouseZips: null,
        distributorWarehouseZips: vendorZips,
        effectiveWarehouseZips: vendorZips,
        warehouseZipsInherited: true,
      });

      const inheritedAdmin = (await caller.doorStyles.listForAdmin()).find((row) => row.id === style.id);
      expect(inheritedAdmin).toMatchObject({
        warehouseZip: null,
        warehouseZips: null,
        distributorWarehouseZips: vendorZips,
        effectiveWarehouseZips: vendorZips,
        warehouseZipsInherited: true,
      });

      await caller.distributorPortal.updateFeaturedStyleMaterials({
        distributorId: line.id,
        styleId: style.id,
        warehouseZips: [],
      });
      const [afterEmptyVendorSave] = await db.select({
        warehouseZip: doorStyles.warehouseZip,
        warehouseZips: doorStyles.warehouseZips,
      }).from(doorStyles).where(eq(doorStyles.id, style.id)).limit(1);
      expect(afterEmptyVendorSave).toEqual({ warehouseZip: null, warehouseZips: null });

      const ownZips = ["10002", "10001"];
      await caller.doorStyles.adminUpdateDoorStyle({ id: style.id, warehouseZips: ownZips });
      const ownedVendor = await caller.distributorPortal.featuredStyles({ distributorId: line.id });
      const ownedRow = ownedVendor.styles.find((row) => row.id === style.id);
      expect(ownedRow).toMatchObject({
        warehouseZip: "10002",
        warehouseZips: ownZips,
        distributorWarehouseZips: vendorZips,
        effectiveWarehouseZips: ownZips,
        warehouseZipsInherited: false,
      });
      const ownedAdmin = (await caller.doorStyles.listForAdmin()).find((row) => row.id === style.id);
      expect(ownedAdmin).toMatchObject({
        warehouseZip: "10002",
        warehouseZips: ownZips,
        distributorWarehouseZips: vendorZips,
        effectiveWarehouseZips: ownZips,
        warehouseZipsInherited: false,
      });

      await caller.doorStyles.adminUpdateDoorStyle({ id: style.id, warehouseZips: null });
      const [afterEmptyAdminSave] = await db.select({
        warehouseZip: doorStyles.warehouseZip,
        warehouseZips: doorStyles.warehouseZips,
      }).from(doorStyles).where(eq(doorStyles.id, style.id)).limit(1);
      expect(afterEmptyAdminSave).toEqual({ warehouseZip: null, warehouseZips: null });
      const reinherited = (await caller.doorStyles.listForAdmin()).find((row) => row.id === style.id);
      expect(reinherited).toMatchObject({
        distributorWarehouseZips: vendorZips,
        effectiveWarehouseZips: vendorZips,
        warehouseZipsInherited: true,
      });
      expect(reinherited?.warehouseZips ?? null).toBeNull();
    } finally {
      await db.update(doorStyles).set({
        warehouseZip: originalStyle.warehouseZip,
        warehouseZips: originalStyle.warehouseZips,
      }).where(eq(doorStyles.id, style.id));
      await db.update(distributors).set({ warehouseZips: line.warehouseZips }).where(eq(distributors.id, line.id));
    }
  });
});
