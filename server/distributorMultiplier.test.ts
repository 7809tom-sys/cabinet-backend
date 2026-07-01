import { describe, it, expect } from "vitest";
import { sellPriceForTier, type TierMarkupBps } from "../shared/margins";

// The Multipliers tab sets cost = listPrice × multiplier (stored as yourCost),
// and every sell price is cost × the per-tier markup. These tests lock in that
// end-to-end arithmetic (the exact math the admin recompute + read path use).
const SETTINGS: TierMarkupBps = {
  homeownerMarkupBps: 16500, // +65%
  contractorMarkupBps: 12900, // +29%
  wholesaleMarkupBps: 12500, // +25%
};

// Mirror of the server recompute: ROUND(list * multiplier, 2).
const recomputeCost = (listPrice: number, multiplier: number) =>
  Math.round(listPrice * multiplier * 100) / 100;

// Mirror of the server setter: effective multiplier = base + freight, rounded to 4dp.
const effectiveMultiplier = (base: number, freight: number) =>
  Math.round((base + freight) * 10000) / 10000;

describe("distributor multiplier → cost → sell pipeline", () => {
  it("cost = listPrice × multiplier (rounded to cents)", () => {
    expect(recomputeCost(753.0, 0.3)).toBe(225.9);
    expect(recomputeCost(394.62, 0.38)).toBe(149.96);
    expect(recomputeCost(100, 0.335)).toBe(33.5);
  });

  it("homeowner sell = (list × multiplier) × 1.65", () => {
    const cost = recomputeCost(753.0, 0.3); // 225.90
    const row = { yourCost: cost };
    expect(sellPriceForTier(row, SETTINGS, "homeowner")).toBe(372.74);
  });

  it("lowering the multiplier lowers cost AND every tier sell price", () => {
    const list = 753.0;
    const high = { yourCost: recomputeCost(list, 0.4) }; // cost 301.20
    const low = { yourCost: recomputeCost(list, 0.3) }; // cost 225.90
    const hHigh = sellPriceForTier(high, SETTINGS, "homeowner")!;
    const hLow = sellPriceForTier(low, SETTINGS, "homeowner")!;
    expect(hLow).toBeLessThan(hHigh);
    // Contractor + wholesale move in lockstep too.
    expect(sellPriceForTier(low, SETTINGS, "contractor")!).toBeLessThan(
      sellPriceForTier(high, SETTINGS, "contractor")!
    );
    expect(sellPriceForTier(low, SETTINGS, "wholesale")!).toBeLessThan(
      sellPriceForTier(high, SETTINGS, "wholesale")!
    );
  });

  it("multiplier of 1.0 makes cost equal list price", () => {
    expect(recomputeCost(542, 1)).toBe(542);
  });

  it("effective multiplier = base + freight (US Cabinet Depot: 0.23 + 0.07 = 0.30)", () => {
    expect(effectiveMultiplier(0.23, 0.07)).toBe(0.3);
    // cost + sell then follow from the effective multiplier
    const cost = recomputeCost(753.0, effectiveMultiplier(0.23, 0.07));
    expect(cost).toBe(225.9);
    expect(sellPriceForTier({ yourCost: cost }, SETTINGS, "homeowner")).toBe(372.74);
  });

  it("lowering only the freight/tariff portion lowers the effective multiplier and cost", () => {
    const list = 753.0;
    const before = effectiveMultiplier(0.23, 0.07); // 0.30
    const after = effectiveMultiplier(0.23, 0.05); // tariff dropped → 0.28
    expect(after).toBeLessThan(before);
    expect(recomputeCost(list, after)).toBeLessThan(recomputeCost(list, before));
  });
});
