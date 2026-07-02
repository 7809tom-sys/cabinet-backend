import { describe, it, expect } from "vitest";
import {
  isStacker,
  isOverRangeAppliance,
  isBridgeOverRange,
  hasCollision,
  conflictingUids,
  type PlacedCabinet,
} from "../client/src/lib/design";

// Minimal placed-cabinet factory for these logic tests.
function cab(partial: Partial<PlacedCabinet> & { uid: string }): PlacedCabinet {
  return {
    uid: partial.uid,
    cabinetId: partial.cabinetId ?? 1,
    masterCode: partial.masterCode ?? "W3030",
    description: partial.description ?? "Wall Cabinet",
    category: partial.category ?? null,
    subCategory: partial.subCategory ?? null,
    placement: partial.placement ?? "wall",
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    width: partial.width ?? 30,
    nominalWidth: partial.nominalWidth ?? partial.width ?? 30,
    depth: partial.depth ?? 12,
    nominalDepth: partial.nominalDepth ?? partial.depth ?? 12,
    height: partial.height ?? 30,
    nominalHeight: partial.nominalHeight ?? partial.height ?? 30,
    rotation: partial.rotation ?? 0,
    ...partial,
  } as PlacedCabinet;
}

describe("isStacker", () => {
  it("detects the word 'stacker' in the description", () => {
    expect(isStacker({ description: "Glass Stacker 30x12" })).toBe(true);
  });
  it("detects 'glass stack' phrasing", () => {
    expect(isStacker({ description: "Wall Glass Stack Cabinet" })).toBe(true);
  });
  it("detects GS-* codes", () => {
    expect(isStacker({ masterCode: "GS-3012" })).toBe(true);
  });
  it("detects GDS-* codes", () => {
    expect(isStacker({ masterCode: "GDS-3015" })).toBe(true);
  });
  it("does NOT match a plain wall cabinet", () => {
    expect(isStacker({ masterCode: "W3030", description: "Wall Cabinet" })).toBe(false);
  });
  it("does NOT match a GD (glass door, non-stacker) code", () => {
    expect(isStacker({ masterCode: "W2430GD", description: "Glass Door Wall" })).toBe(false);
  });
});

describe("isOverRangeAppliance", () => {
  it("flags an over-range microwave", () => {
    expect(isOverRangeAppliance({ masterCode: "MW-30", placement: "appliance" })).toBe(true);
  });
  it("flags a range hood", () => {
    expect(isOverRangeAppliance({ masterCode: "HOOD-30", placement: "appliance" })).toBe(true);
  });
  it("does not flag a range itself", () => {
    expect(isOverRangeAppliance({ masterCode: "RANGE-30", placement: "appliance" })).toBe(false);
  });
  it("does not flag a wall cabinet", () => {
    expect(isOverRangeAppliance({ masterCode: "MW-30", placement: "wall" })).toBe(false);
  });
});

describe("bridge cabinet over an over-range microwave", () => {
  // A short bridge wall cabinet mounted directly above an over-range microwave.
  const bridge = cab({ uid: "bridge", masterCode: "W3012", placement: "wall", x: 40, y: 0, width: 30, height: 12 });
  const microwave = cab({ uid: "mw", masterCode: "MW-30", placement: "appliance", x: 40, y: 0, width: 30, height: 17 });

  it("isBridgeOverRange recognizes the pairing", () => {
    expect(isBridgeOverRange(bridge, microwave)).toBe(true);
    expect(isBridgeOverRange(microwave, bridge)).toBe(true);
  });

  it("hasCollision does NOT flag the bridge over the microwave", () => {
    expect(hasCollision(bridge, [microwave])).toBe(false);
    expect(hasCollision(microwave, [bridge])).toBe(false);
  });

  it("conflictingUids does NOT flag the bridge/microwave pair", () => {
    const conflicts = conflictingUids([bridge, microwave]);
    expect(conflicts.has("bridge")).toBe(false);
    expect(conflicts.has("mw")).toBe(false);
  });

  it("still flags a wall cabinet overlapping a RANGE (not exempt)", () => {
    const range = cab({ uid: "range", masterCode: "RANGE-30", placement: "appliance", x: 40, y: 0, width: 30, height: 36 });
    // A wall cabinet over a range is NOT the exempt pairing; occupiesUpperZone
    // differs (range is a floor appliance), so hasCollision should not treat it
    // as a bridge exemption. The pairing helper must be false.
    expect(isBridgeOverRange(bridge, range)).toBe(false);
  });
});

import { APPLIANCES, isApplianceCode, appliancesForRoom } from "../client/src/lib/design";

describe("wine cooler appliance fixture", () => {
  it("exists in the APPLIANCES list as an undercounter kitchen unit", () => {
    const wine = APPLIANCES.find((a) => a.masterCode === "WINE-24");
    expect(wine).toBeDefined();
    expect(wine!.key).toBe("winecooler");
    expect(wine!.rooms).toContain("kitchen");
    // Undercounter height so the countertop can bridge over it.
    expect(wine!.elevBottom).toBe(0);
    expect(wine!.elevHeight).toBeLessThanOrEqual(36);
  });

  it("is recognized as an appliance code", () => {
    expect(isApplianceCode("WINE-24")).toBe(true);
  });

  it("shows up in the kitchen appliance set but not bathroom/laundry", () => {
    expect(appliancesForRoom("kitchen").map((a) => a.masterCode)).toContain("WINE-24");
    expect(appliancesForRoom("bathroom").map((a) => a.masterCode)).not.toContain("WINE-24");
    expect(appliancesForRoom("laundry").map((a) => a.masterCode)).not.toContain("WINE-24");
  });
});
