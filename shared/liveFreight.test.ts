import { describe, it, expect } from "vitest";
import {
  totalPackagedLoad,
  buildPallets,
  packagedCubicFt,
  applyKitchenFloor,
  isKitchenOrder,
  type PalletCaps,
} from "./liveFreight";

const CAPS: PalletCaps = {
  palletLengthIn: 96,
  palletWidthIn: 40,
  palletHeightIn: 60,
  palletMaxWeightLbs: 1200,
  palletMaxCubicFt: 100,
  palletTareLbs: 50,
};

describe("totalPackagedLoad", () => {
  it("sums weight, cube, and units across lines", () => {
    const r = totalPackagedLoad([
      { weightLbs: 50, cubicFt: 5, qty: 2 },
      { weightLbs: 100, cubicFt: 10, qty: 1 },
    ]);
    expect(r.weightLbs).toBe(200);
    expect(r.cubicFt).toBe(20);
    expect(r.units).toBe(3);
  });

  it("ignores negative/zero quantities safely", () => {
    const r = totalPackagedLoad([{ weightLbs: 50, cubicFt: 5, qty: 0 }]);
    expect(r.weightLbs).toBe(0);
    expect(r.units).toBe(0);
  });
});

describe("buildPallets", () => {
  it("returns no pallets for an empty load", () => {
    const plan = buildPallets([], CAPS);
    expect(plan.palletCount).toBe(0);
    expect(plan.pallets).toHaveLength(0);
  });

  it("uses a single 8 ft pallet for a small order and adds tare", () => {
    const plan = buildPallets([{ weightLbs: 300, cubicFt: 30, qty: 1 }], CAPS);
    expect(plan.palletCount).toBe(1);
    expect(plan.pallets[0].lengthIn).toBe(96);
    // contents 300 + tare 50
    expect(plan.pallets[0].weightLbs).toBe(350);
    expect(plan.totalWeightLbs).toBe(350);
  });

  it("splits into multiple pallets when the weight cap is exceeded", () => {
    // 2500 lbs / 1200 cap => 3 pallets
    const plan = buildPallets([{ weightLbs: 2500, cubicFt: 10, qty: 1 }], CAPS);
    expect(plan.palletCount).toBe(3);
    expect(plan.totalContentsWeightLbs).toBe(2500);
    // tare added per pallet
    expect(plan.totalWeightLbs).toBeGreaterThan(2500);
  });

  it("splits into multiple pallets when the cube cap is exceeded", () => {
    // 250 cu ft / 100 cap => 3 pallets even though weight is light
    const plan = buildPallets([{ weightLbs: 200, cubicFt: 250, qty: 1 }], CAPS);
    expect(plan.palletCount).toBe(3);
    expect(plan.totalCubicFt).toBe(250);
  });
});

describe("packagedCubicFt", () => {
  it("computes cubic feet from packaging inches", () => {
    // 24 x 24 x 12 in = 6912 cu in = 4 cu ft
    expect(packagedCubicFt(24, 24, 12, 8)).toBeCloseTo(4, 5);
  });

  it("falls back when any dimension is missing", () => {
    expect(packagedCubicFt(null, 24, 12, 8)).toBe(8);
    expect(packagedCubicFt(24, 0, 12, 8)).toBe(8);
  });
});

describe("isKitchenOrder", () => {
  it("treats orders at/above the threshold as kitchens", () => {
    expect(isKitchenOrder(6, 6)).toBe(true);
    expect(isKitchenOrder(10, 6)).toBe(true);
  });
  it("treats small parts orders as non-kitchen", () => {
    expect(isKitchenOrder(2, 6)).toBe(false);
  });
});

describe("applyKitchenFloor", () => {
  it("raises a kitchen order below the floor up to $800", () => {
    const r = applyKitchenFloor({
      ratedFreightCents: 52000,
      isKitchen: true,
      kitchenFreightFloorCents: 80000,
    });
    expect(r.finalCents).toBe(80000);
    expect(r.floorApplied).toBe(true);
  });

  it("keeps a kitchen rate already above the floor", () => {
    const r = applyKitchenFloor({
      ratedFreightCents: 95000,
      isKitchen: true,
      kitchenFreightFloorCents: 80000,
    });
    expect(r.finalCents).toBe(95000);
    expect(r.floorApplied).toBe(false);
  });

  it("never forces a non-kitchen order to the floor", () => {
    const r = applyKitchenFloor({
      ratedFreightCents: 12000,
      isKitchen: false,
      kitchenFreightFloorCents: 80000,
    });
    expect(r.finalCents).toBe(12000);
    expect(r.floorApplied).toBe(false);
  });
});
