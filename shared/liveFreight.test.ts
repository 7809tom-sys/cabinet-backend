import { describe, it, expect } from "vitest";
import {
  totalPackagedLoad,
  buildPallets,
  packagedCubicFt,
  type PalletCaps,
} from "./liveFreight";

const CAPS: PalletCaps = {
  standardPalletLengthIn: 48,
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

  it("uses a standard pallet for ordinary cabinet cartons and adds tare", () => {
    const plan = buildPallets(
      [{ weightLbs: 300, cubicFt: 30, qty: 1, maxPackageLengthIn: 36 }],
      CAPS,
    );
    expect(plan.palletCount).toBe(1);
    expect(plan.pallets[0].lengthIn).toBe(48);
    // contents 300 + tare 50
    expect(plan.pallets[0].weightLbs).toBe(350);
    expect(plan.totalWeightLbs).toBe(350);
  });

  it("uses the 8 ft pallet only when a package is at least 7 ft long and preserves shorter required lengths", () => {
    const longPlan = buildPallets(
      [{ weightLbs: 40, cubicFt: 4, qty: 1, maxPackageLengthIn: 96 }],
      CAPS,
    );
    const shortPlan = buildPallets(
      [{ weightLbs: 40, cubicFt: 4, qty: 1, maxPackageLengthIn: 72 }],
      CAPS,
    );

    expect(longPlan.pallets[0].lengthIn).toBe(96);
    expect(shortPlan.pallets[0].lengthIn).toBe(72);
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

describe("buildPallets — complete-kitchen trim consolidation", () => {
  it("keeps long trim on one complete-kitchen shipment without adding a separate pallet", () => {
    const plan = buildPallets(
      [
        { weightLbs: 45, cubicFt: 8, qty: 12, maxPackageLengthIn: 42 },
        { weightLbs: 8, cubicFt: 1, qty: 3, maxPackageLengthIn: 96, isTrim: true },
      ],
      CAPS,
    );

    expect(plan.palletCount).toBe(1);
    expect(plan.pallets.every((pallet) => pallet.lengthIn === 96)).toBe(true);
    expect(plan.totalContentsWeightLbs).toBe(564);
    expect(plan.totalCubicFt).toBe(99);
  });

  it("uses an 8-foot pallet for a standalone long trim shipment", () => {
    const plan = buildPallets(
      [{ weightLbs: 8, cubicFt: 1, qty: 3, maxPackageLengthIn: 96, isTrim: true }],
      CAPS,
    );

    expect(plan.pallets.every((pallet) => pallet.lengthIn === 96)).toBe(true);
  });

  it("uses an 8-foot pallet when a non-trim long item changes the kitchen footprint", () => {
    const plan = buildPallets(
      [
        { weightLbs: 45, cubicFt: 8, qty: 12, maxPackageLengthIn: 42 },
        { weightLbs: 100, cubicFt: 10, qty: 1, maxPackageLengthIn: 90 },
      ],
      CAPS,
    );

    expect(plan.pallets.every((pallet) => pallet.lengthIn === 96)).toBe(true);
  });
});
