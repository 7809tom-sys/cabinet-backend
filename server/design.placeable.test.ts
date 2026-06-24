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
