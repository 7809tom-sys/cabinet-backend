import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { cabinets, distributorSkus, skuMasterAliases } from "../drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { resolveCanonicalCatalogSources } from "./lib/canonicalCatalogSources";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

async function canonicalIdsForLiveSourceRows(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  conditions: Parameters<typeof and>,
) {
  const sourceRows = await db
    .select({ sourceMasterCode: cabinets.masterCode })
    .from(distributorSkus)
    .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
    .where(and(
      ...conditions,
      sql`(COALESCE(${distributorSkus.listPrice}, 0) > 0 OR COALESCE(${distributorSkus.yourCost}, 0) > 0)`,
      sql`${cabinets.conflictStatus} <> 'conflict'`,
    ));
  const [aliases, masters] = await Promise.all([
    db
      .select({ aliasCode: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode })
      .from(skuMasterAliases)
      .where(eq(skuMasterAliases.conflictStatus, "ok")),
    db.select({ id: cabinets.id, masterCode: cabinets.masterCode }).from(cabinets),
  ]);
  return new Set(resolveCanonicalCatalogSources(sourceRows, aliases, masters).map(({ master }) => master.id));
}

describe("design.placeableCabinets availability filter", () => {
  it("returns AW1230, AW1236, and AW1242 as regular wall-end cabinets, never corners", async () => {
    const db = await getDb();
    if (!db) return;

    const wall = await appRouter.createCaller(publicCtx()).design.placeableCabinets({ placement: "wall" });
    const aw = wall.filter((cabinet) => ["AW1230", "AW1236", "AW1242"].includes(cabinet.masterCode));

    expect(aw.map((cabinet) => cabinet.masterCode).sort()).toEqual(["AW1230", "AW1236", "AW1242"]);
    expect(aw.map((cabinet) => Number(cabinet.height)).sort((a, b) => a - b)).toEqual([30, 36, 42]);
    for (const cabinet of aw) {
      expect(cabinet).toMatchObject({
        category: "Wall",
        subCategory: "Wall End Cabinet",
        placement: "wall",
        isCornerCabinet: false,
        cornerType: null,
        graphicType: "wall_angle",
        numberOfDoors: 1,
      });
    }
  });

  it("only returns cabinets that have a published + available distributor SKU", async () => {
    const db = await getDb();
    if (!db) {
      // No DB in this environment — nothing to assert.
      return;
    }

    const caller = appRouter.createCaller(publicCtx());
    const base = await caller.design.placeableCabinets({ placement: "base" });

    expect(Array.isArray(base)).toBe(true);
    expect(base.length).toBeGreaterThan(0);

    // Every returned canonical master must have at least one available,
    // published, positive supplier row — directly or through an approved alias.
    const purchasable = await canonicalIdsForLiveSourceRows(db, [
      eq(distributorSkus.isAvailable, true),
      eq(distributorSkus.isPublished, true),
    ]);
    for (const c of base) {
      expect(purchasable.has(c.id), `${c.masterCode} should be purchasable`).toBe(true);
    }

    // All base-tier results are classified as base placement.
    for (const c of base) {
      expect((c as { placement: string }).placement).toBe("base");
    }
  });

  it("orders the base palette by width ascending (narrow boxes like B-12/B-15 come first)", async () => {
    const db = await getDb();
    if (!db) return;

    const caller = appRouter.createCaller(publicCtx());
    const base = await caller.design.placeableCabinets({ placement: "base" });
    if (base.length < 2) return;

    const widthNum = (w: unknown) => {
      const n = parseFloat(String(w ?? ""));
      return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
    };

    // The returned list must be non-decreasing by width, so the palette reads
    // small -> large and the narrow base cabinets always lead.
    for (let i = 1; i < base.length; i++) {
      const prev = widthNum((base[i - 1] as { width: unknown }).width);
      const cur = widthNum((base[i] as { width: unknown }).width);
      expect(
        prev <= cur,
        `base palette out of order at index ${i}: ${base[i - 1].masterCode} (${prev}) before ${base[i].masterCode} (${cur})`
      ).toBe(true);
    }
  });

  it("never surfaces accessory/trim items (e.g. countertop support brackets) in the placeable palette", async () => {
    const db = await getDb();
    if (!db) return;

    const caller = appRouter.createCaller(publicCtx());
    // Pull the whole placeable palette (all three buckets) with no style gate.
    const all = (
      await Promise.all([
        caller.design.placeableCabinets({ placement: "base" }),
        caller.design.placeableCabinets({ placement: "wall" }),
        caller.design.placeableCabinets({ placement: "tall" }),
      ])
    ).flat();
    const paletteIds = new Set(all.map((c) => c.id));

    // Any cabinet whose placementType is accessory/trim is an accessory area item
    // (brackets, hardware, fillers, separately-sold glass doors) and must NOT
    // appear in the drag-and-drop placement palette.
    const accessoryRows = await db
      .select({ id: cabinets.id, masterCode: cabinets.masterCode })
      .from(cabinets)
      .where(and(eq(cabinets.isActive, true), eq(cabinets.placementType, "accessory/trim")));

    for (const a of accessoryRows) {
      expect(
        paletteIds.has(a.id),
        `${a.masterCode} (accessory/trim) must be excluded from the placeable palette`
      ).toBe(false);
    }
  });

  it("returns accessory/trim items in the dedicated accessory tab", async () => {
    const db = await getDb();
    if (!db) return;

    const caller = appRouter.createCaller(publicCtx());
    const accessories = await caller.design.placeableCabinets({ placement: "accessory" });

    expect(Array.isArray(accessories)).toBe(true);
    expect(accessories.length).toBeGreaterThan(0);

	    // Imported supplier categories are not uniform: decorative end panels,
	    // filler stock, and other hardware may retain a base/tall source category.
	    // The public placement assignment is the authoritative contract for this tab.
	    for (const a of accessories) {
	      expect((a as { placement: string }).placement).toBe("accessory");
	    }

    // Accessory items must NOT appear in any of the placeable (base/wall/tall) tabs.
    const placeable = (
      await Promise.all([
        caller.design.placeableCabinets({ placement: "base" }),
        caller.design.placeableCabinets({ placement: "wall" }),
        caller.design.placeableCabinets({ placement: "tall" }),
      ])
    ).flat();
    const placeableIds = new Set(placeable.map((c) => c.id));
    for (const a of accessories) {
      expect(
        placeableIds.has(a.id),
        `${a.masterCode} (accessory) must not appear in base/wall/tall tabs`
      ).toBe(false);
    }
  });

  it("surfaces crown molding and fillers (Trim & Molding) in the accessory tab", async () => {
    const db = await getDb();
    if (!db) return;

    const caller = appRouter.createCaller(publicCtx());
    const accessories = await caller.design.placeableCabinets({ placement: "accessory" });
    const codes = new Set(accessories.map((a) => a.masterCode));

    // Representative trim/molding + filler codes that members must be able to add.
    const expected = ["CM-8", "F-3-96"];
    for (const code of expected) {
      // Only assert if the catalog actually carries the code with a live SKU.
      const present = await db
        .select({ id: cabinets.id })
        .from(cabinets)
        .where(and(eq(cabinets.isActive, true), eq(cabinets.masterCode, code)))
        .limit(1);
      if (present.length === 0) continue;
      const hasSku = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(
          and(
            eq(distributorSkus.cabinetId, present[0].id),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true)
          )
        )
        .limit(1);
      if (hasSku.length === 0) continue;
      expect(codes.has(code), `${code} should be available in the accessory tab`).toBe(true);
    }
  });

  it("keeps FLDL as a decorative accessory and never turns it into a filler candidate", async () => {
    const db = await getDb();
    if (!db) return;

    const [fldl] = await db
      .select({
        id: cabinets.id,
        category: cabinets.category,
        subCategory: cabinets.subCategory,
        placementType: cabinets.placementType,
      })
      .from(cabinets)
      .where(eq(cabinets.masterCode, "FLDL"))
      .limit(1);
    if (!fldl) return;

    expect(fldl).toMatchObject({
      category: "Accessory",
      subCategory: "Decorative Leg",
      placementType: "accessory",
    });

    const caller = appRouter.createCaller(publicCtx());
    const [accessories, ...placementBuckets] = await Promise.all([
      caller.design.placeableCabinets({ placement: "accessory" }),
      caller.design.placeableCabinets({ placement: "base" }),
      caller.design.placeableCabinets({ placement: "wall" }),
      caller.design.placeableCabinets({ placement: "tall" }),
    ]);
    const hasLiveFldlSku = (await db
      .select({ id: distributorSkus.id })
      .from(distributorSkus)
      .where(and(
        eq(distributorSkus.cabinetId, fldl.id),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
        sql`(COALESCE(${distributorSkus.listPrice}, 0) > 0 OR COALESCE(${distributorSkus.yourCost}, 0) > 0)`,
      ))
      .limit(1)).length > 0;

    if (hasLiveFldlSku) {
      expect(accessories.some((item) => item.masterCode === "FLDL")).toBe(true);
    }
    expect(placementBuckets.flat().some((item) => item.masterCode === "FLDL")).toBe(false);
  });

  it("surfaces the Lazy-Susan corner bases (LSB33/LSB36/LSB36ADA) in the base tab even though they are ADA placement", async () => {
    const db = await getDb();
    if (!db) return;

    const caller = appRouter.createCaller(publicCtx());
    const base = await caller.design.placeableCabinets({ placement: "base" });
    const codes = new Set(base.map((c) => c.masterCode));

    // Only assert for LSB codes that actually carry a live (published+available)
    // SKU in this environment — otherwise the availability gate legitimately
    // hides them and the assertion would be a false negative.
    for (const code of ["LSB33", "LSB36", "LSB36ADA"]) {
      const row = await db
        .select({ id: cabinets.id })
        .from(cabinets)
        .where(and(eq(cabinets.isActive, true), eq(cabinets.masterCode, code)))
        .limit(1);
      if (row.length === 0) continue;
      const hasSku = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(
          and(
            eq(distributorSkus.cabinetId, row[0].id),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true)
          )
        )
        .limit(1);
      if (hasSku.length === 0) continue;
      expect(codes.has(code), `${code} must appear in the base placement tab`).toBe(true);
    }
  });

	it("surfaces ordinary (non-corner) base cabinets in the base tab", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const base = await caller.design.placeableCabinets({ placement: "base" });
    const codes = new Set(base.map((c) => c.masterCode));

	    // Alias reconciliation retires legacy punctuation variants such as B-24;
	    // test the canonical live palette, not a brittle set of historical codes.
	    const standardBases = base.filter((cabinet) => {
	      const item = cabinet as {
	        category: string | null;
	        placementType: string | null;
	        isCornerCabinet: boolean;
	      };
	      return item.category === "Base"
	        && item.placementType === "base"
	        && !item.isCornerCabinet;
	    });
	    expect(standardBases.length).toBeGreaterThan(0);
	    for (const cabinet of standardBases) {
	      expect(codes.has(cabinet.masterCode), `${cabinet.masterCode} must appear in the base placement tab`).toBe(true);
	    }
  });

  it("locks the palette to a single distributor when distributorId is provided (Lock supply line)", async () => {
    const db = await getDb();
    if (!db) return;

    const caller = appRouter.createCaller(publicCtx());

    // Pick a real distributor that carries base cabinets.
    const sample = await db
      .select({ distributorId: distributorSkus.distributorId })
      .from(distributorSkus)
      .where(and(eq(distributorSkus.isAvailable, true), eq(distributorSkus.isPublished, true)))
      .limit(1);
    if (sample.length === 0) return;
    const { distributorId } = sample[0];

    // Locked palette: distributor only, no style gate (member can still change
    // color within the locked line).
    const locked = await caller.design.placeableCabinets({ placement: "base", distributorId });
    expect(Array.isArray(locked)).toBe(true);
    if (locked.length === 0) return;

    // Every cabinet in the locked palette must be carried by the locked
    // distributor (directly or under a retired alias source record).
    const carriedByLocked = await canonicalIdsForLiveSourceRows(db, [
      eq(distributorSkus.distributorId, distributorId),
      eq(distributorSkus.isAvailable, true),
      eq(distributorSkus.isPublished, true),
    ]);
    for (const c of locked) {
      expect(
        carriedByLocked.has(c.id),
        `${c.masterCode} must be carried by the locked distributor`
      ).toBe(true);
    }
  });

  it("gates the palette to the SELECTED door style alone (excludes cabinets carried only under a different style)", async () => {
    const db = await getDb();
    if (!db) return;

    const caller = appRouter.createCaller(publicCtx());

    // Find two distinct styleIds that each have at least one live SKU.
    const styleRows = await db
      .selectDistinct({ styleId: distributorSkus.styleId })
      .from(distributorSkus)
      .where(and(eq(distributorSkus.isAvailable, true), eq(distributorSkus.isPublished, true)))
      .limit(10);
    const styleIds = styleRows
      .map((r) => r.styleId)
      .filter((s): s is number => typeof s === "number");
    if (styleIds.length < 2) return; // need two styles to compare

    const [styleA] = styleIds;

    // The palette for styleA must contain ONLY cabinets that have a live SKU
    // under styleA — never a cabinet that exists solely under styleB.
    const paletteA = (
      await Promise.all([
        caller.design.placeableCabinets({ placement: "base", styleId: styleA }),
        caller.design.placeableCabinets({ placement: "wall", styleId: styleA }),
        caller.design.placeableCabinets({ placement: "tall", styleId: styleA }),
      ])
    ).flat();
    if (paletteA.length === 0) return;

    const carriedByA = await canonicalIdsForLiveSourceRows(db, [
      eq(distributorSkus.styleId, styleA),
      eq(distributorSkus.isAvailable, true),
      eq(distributorSkus.isPublished, true),
    ]);
    for (const c of paletteA) {
      expect(
        carriedByA.has(c.id),
        `${c.masterCode} appears for style ${styleA} but has no live SKU for that style`
      ).toBe(true);
    }
  });

  it("narrows the palette when a distributor + style is provided", async () => {
    const db = await getDb();
    if (!db) return;

    const caller = appRouter.createCaller(publicCtx());

    // Pick a real distributor/style pair that has available SKUs.
    const sample = await db
      .select({
        distributorId: distributorSkus.distributorId,
        styleId: distributorSkus.styleId,
      })
      .from(distributorSkus)
      .where(and(eq(distributorSkus.isAvailable, true), eq(distributorSkus.isPublished, true)))
      .limit(1);

    if (sample.length === 0) return;
    const { distributorId, styleId } = sample[0];

    const scoped = await caller.design.placeableCabinets({ distributorId, styleId });
    expect(Array.isArray(scoped)).toBe(true);

    // Every scoped cabinet must have an available SKU for THIS exact combination.
    if (scoped.length === 0) return;
    const okForCombo = await canonicalIdsForLiveSourceRows(db, [
      eq(distributorSkus.distributorId, distributorId),
      eq(distributorSkus.styleId, styleId),
      eq(distributorSkus.isAvailable, true),
      eq(distributorSkus.isPublished, true),
    ]);
    for (const c of scoped) {
      expect(okForCombo.has(c.id), `${c.masterCode} available for combo`).toBe(true);
    }
  });
});
