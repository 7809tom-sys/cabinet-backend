import { describe, expect, it } from "vitest";
import { classifyKitchenCabinet, countKitchenCabinets } from "./kitchenPlanCabinetBreakdown";

const catalog = new Map([
  [1, { category: "Base" }], [2, { category: "Wall" }], [3, { category: "Tall" }],
  [4, { category: "Accessory", placementType: "base", subCategory: "Drawer Organizer" }],
  [5, { category: "ADA", placementType: "base" }],
]);

describe("saved Kitchen plan cabinet breakdown", () => {
  it("classifies real catalog families and excludes accessories even with cabinet placement words", () => {
    expect(classifyKitchenCabinet({ category: "Base" })).toBe("base");
    expect(classifyKitchenCabinet({ category: "Wall Cabinet" })).toBe("wall");
    expect(classifyKitchenCabinet({ category: "Tall", productType: "Pantry" })).toBe("tall");
    expect(classifyKitchenCabinet({ category: "Accessory", placementType: "wall" })).toBeNull();
    expect(classifyKitchenCabinet({ category: "Panel", placementType: "tall" })).toBeNull();
    expect(classifyKitchenCabinet({ category: "Filler", placementType: "base" })).toBeNull();
    expect(classifyKitchenCabinet({ category: "Base", isNotCabinet: true })).toBeNull();
    expect(classifyKitchenCabinet({ category: "Corner", placementType: "base" })).toBe("base");
    expect(classifyKitchenCabinet({ category: "ADA", placementType: "base" })).toBe("base");
  });
  it("counts each physical placement while respecting an explicit whole quantity", () => {
    expect(countKitchenCabinets([{ cabinetId: 1 }, { cabinetId: 2, qty: 2 }, { cabinetId: 3 }, { cabinetId: 4 }], catalog))
      .toEqual({ base: 1, wall: 2, tall: 1, total: 4 });
  });
  it("counts a repeated UID once but counts different placements of the same SKU", () => {
    expect(countKitchenCabinets([{ cabinetId: 1, uid: "a", qty: 2 }, { cabinetId: 1, uid: "a", qty: 2 }, { cabinetId: 1, uid: "b" }], catalog))
      .toEqual({ base: 3, wall: 0, tall: 0, total: 3 });
  });
  it("rejects malformed quantities and placements without producing NaN counts", () => {
    expect(countKitchenCabinets([null, {}, { cabinetId: 1, qty: 0 }, { cabinetId: 1, qty: -1 }, { cabinetId: 1, qty: NaN }, { cabinetId: 1, qty: 2.5 }, { cabinetId: 99 }], catalog))
      .toEqual({ base: 0, wall: 0, tall: 0, total: 0 });
    expect(countKitchenCabinets(null, catalog).total).toBe(0);
  });
});
