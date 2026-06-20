import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { KITCHEN_PACKAGES } from "../shared/packages";

function publicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("packages router", () => {
  it("lists all defined kitchen packages with priced BOMs", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const list = await caller.packages.list();

    expect(list).toHaveLength(KITCHEN_PACKAGES.length);

    for (const p of list) {
      // Every BOM line should resolve to a real cabinet cost (no MISSING items).
      for (const line of p.lines) {
        expect(line.available, `${p.slug} line ${line.masterCode} priced`).toBe(true);
        expect(line.unitCost).toBeGreaterThan(0);
        expect(line.lineTotal).toBeCloseTo((line.unitCost ?? 0) * line.qty, 2);
      }

      // Landed cost = cabinet subtotal + assembly + est freight.
      const expectedLanded = Number(
        (p.cabinetSubtotal + p.assemblyFee + p.estFreight).toFixed(2)
      );
      expect(p.landedCost).toBeCloseTo(expectedLanded, 2);

      // Assembly fee is $30 per cabinet.
      expect(p.assemblyFee).toBe(p.cabinetCount * 30);

      // Freight is ~8% of cabinet subtotal.
      expect(p.estFreight).toBeCloseTo(p.cabinetSubtotal * 0.08, 1);

      // Suggested retail sits below the competitor average, and we still profit.
      expect(p.suggestedRetail).toBeLessThan(p.competitorAvg);
      expect(p.affiliateProfit).toBeGreaterThan(0);
      expect(p.affiliateProfit).toBeCloseTo(p.suggestedRetail - p.landedCost, 2);
      expect(p.affiliateMargin).toBeGreaterThan(0);
      expect(p.affiliateMargin).toBeLessThan(1);
    }
  });

  it("returns a priced package by slug and null for unknown slugs", async () => {
    const caller = appRouter.createCaller(publicCtx());

    const lShape = await caller.packages.bySlug({ slug: "l-shape-10x10" });
    expect(lShape).not.toBeNull();
    expect(lShape?.name).toContain("L-Shape");
    expect(lShape?.cabinetCount).toBe(11);
    // Headline L-Shape should land well under the competitor average.
    expect(lShape!.landedCost).toBeLessThan(lShape!.competitorAvg);

    const missing = await caller.packages.bySlug({ slug: "does-not-exist" });
    expect(missing).toBeNull();
  });

  it("resolves a package layout into placeable cabinets for the design tool", async () => {
    const caller = appRouter.createCaller(publicCtx());
    const layout = await caller.packages.layout({ slug: "l-shape-10x10" });

    expect(layout).not.toBeNull();
    expect(layout?.room.width).toBeGreaterThan(0);
    expect(layout?.room.depth).toBeGreaterThan(0);
    expect(layout!.items.length).toBeGreaterThan(0);

    for (const it of layout!.items as Array<{ cabinetId: number; placement: string }>) {
      expect(it.cabinetId).toBeGreaterThan(0);
      expect(["base", "wall", "tall"]).toContain(it.placement);
    }
  });
});
