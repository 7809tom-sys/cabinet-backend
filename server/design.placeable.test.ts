import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { cabinets, distributorSkus } from "../drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("design.placeableCabinets availability filter", () => {
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

    // Every returned cabinet must have at least one available + published SKU.
    const ids = base.map((c) => c.id);
    const skuRows = await db
      .select({ cabinetId: distributorSkus.cabinetId })
      .from(distributorSkus)
      .where(
        and(
          inArray(distributorSkus.cabinetId, ids),
          eq(distributorSkus.isAvailable, true),
          eq(distributorSkus.isPublished, true)
        )
      );
    const purchasable = new Set(skuRows.map((r) => r.cabinetId));
    for (const c of base) {
      expect(purchasable.has(c.id), `${c.masterCode} should be purchasable`).toBe(true);
    }

    // All base-tier results are classified as base placement.
    for (const c of base) {
      expect((c as { placement: string }).placement).toBe("base");
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

    // Every returned item must be an accessory (category=Accessory or an
    // accessory/trim placementType) and tagged with placement "accessory".
    for (const a of accessories) {
      const cat = ((a as { category: string | null }).category || "").toLowerCase();
      const pt = ((a as { placementType: string | null }).placementType || "").toLowerCase();
      const isAccessory = cat === "accessory" || pt.includes("accessory") || pt.includes("trim");
      expect(isAccessory, `${a.masterCode} should be an accessory`).toBe(true);
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
    const db = await getDb();
    if (!db) return;

    const caller = appRouter.createCaller(publicCtx());
    const base = await caller.design.placeableCabinets({ placement: "base" });
    const codes = new Set(base.map((c) => c.masterCode));

    // The base tab must never come back empty of plain base boxes. Assert that a
    // representative spread of standard base SKUs is present (guards against a
    // classifier/filter regression silently emptying the Base list).
    let asserted = 0;
    for (const code of ["B-12", "B-18", "B-24", "B-36", "SB-30", "DB-24-2"]) {
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
      asserted++;
    }
    // At least one standard base SKU should have been verifiable in this catalog.
    expect(asserted).toBeGreaterThan(0);
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
    const ids = locked.map((c) => c.id);
    if (ids.length === 0) return;

    // Every cabinet in the locked palette must be carried by the locked
    // distributor (no cabinet leaks in from another supply line).
    const rows = await db
      .select({ cabinetId: distributorSkus.cabinetId })
      .from(distributorSkus)
      .where(
        and(
          inArray(distributorSkus.cabinetId, ids),
          eq(distributorSkus.distributorId, distributorId),
          eq(distributorSkus.isAvailable, true),
          eq(distributorSkus.isPublished, true)
        )
      );
    const carriedByLocked = new Set(rows.map((r) => r.cabinetId));
    for (const c of locked) {
      expect(
        carriedByLocked.has(c.id),
        `${c.masterCode} must be carried by the locked distributor`
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
    const ids = scoped.map((c) => c.id);
    if (ids.length === 0) return;
    const rows = await db
      .select({ cabinetId: distributorSkus.cabinetId })
      .from(distributorSkus)
      .where(
        and(
          inArray(distributorSkus.cabinetId, ids),
          eq(distributorSkus.distributorId, distributorId),
          eq(distributorSkus.styleId, styleId),
          eq(distributorSkus.isAvailable, true),
          eq(distributorSkus.isPublished, true)
        )
      );
    const okForCombo = new Set(rows.map((r) => r.cabinetId));
    for (const c of scoped) {
      expect(okForCombo.has(c.id), `${c.masterCode} available for combo`).toBe(true);
    }
  });
});
