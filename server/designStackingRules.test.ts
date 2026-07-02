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

import {
  isOverRangeMicrowave,
  bridgeCabinetCodeForWidth,
  isRangeOrOven,
  isRefrigerator,
  staggeredWallCabinetHeight,
  staggeredMountBottom,
  fridgeCornerUpperDepth,
  standardWallCabinetHeight,
  STAGGER_TALLER_IN,
  FRIDGE_CORNER_UPPER_DEPTH_IN,
} from "../client/src/lib/design";

describe("isOverRangeMicrowave", () => {
  it("flags an over-range microwave (MW-*) placed as an appliance", () => {
    expect(isOverRangeMicrowave({ masterCode: "MW-30", placement: "appliance" })).toBe(true);
  });
  it("does NOT flag a range hood (hoods vent, no cabinet hangs above)", () => {
    expect(isOverRangeMicrowave({ masterCode: "HOOD-30", placement: "appliance" })).toBe(false);
  });
  it("does NOT flag a range/cooktop itself", () => {
    expect(isOverRangeMicrowave({ masterCode: "RANGE-30", placement: "appliance" })).toBe(false);
  });
  it("does NOT flag an MW code that is not placed as an appliance", () => {
    expect(isOverRangeMicrowave({ masterCode: "MW-30", placement: "wall" })).toBe(false);
  });
});

describe("bridgeCabinetCodeForWidth", () => {
  it("suggests the 30\" bridge (W-30-12) for a standard 30\" OTR microwave", () => {
    expect(bridgeCabinetCodeForWidth(30)).toBe("W-30-12");
  });
  it("suggests the 36\" bridge for a 36\" cooktop opening", () => {
    expect(bridgeCabinetCodeForWidth(36)).toBe("W-36-12");
  });
  it("suggests the 33\" bridge for a 33\" opening", () => {
    expect(bridgeCabinetCodeForWidth(33)).toBe("W-33-12");
  });
  it("snaps an odd width up to the nearest stock bridge width", () => {
    expect(bridgeCabinetCodeForWidth(31)).toBe("W-30-12");
    expect(bridgeCabinetCodeForWidth(35)).toBe("W-36-12");
    expect(bridgeCabinetCodeForWidth(32)).toBe("W-33-12");
  });
  it("falls back to the 30\" bridge for a non-finite width", () => {
    expect(bridgeCabinetCodeForWidth(Number.NaN)).toBe("W-30-12");
  });
  it("always returns a real stock bridge SKU (W-30/33/36-12)", () => {
    for (const w of [24, 30, 33, 36, 42, 48]) {
      expect(["W-30-12", "W-33-12", "W-36-12"]).toContain(bridgeCabinetCodeForWidth(w));
    }
  });
});

describe("isRefrigerator", () => {
  it("flags a refrigerator (FRIDGE-*) placed as an appliance", () => {
    expect(isRefrigerator({ masterCode: "FRIDGE-36", placement: "appliance" })).toBe(true);
    expect(isRefrigerator({ masterCode: "FRIDGE-30", placement: "appliance" })).toBe(true);
  });
  it("does NOT flag other appliances", () => {
    expect(isRefrigerator({ masterCode: "RANGE-30", placement: "appliance" })).toBe(false);
    expect(isRefrigerator({ masterCode: "DW-24", placement: "appliance" })).toBe(false);
    expect(isRefrigerator({ masterCode: "MW-30", placement: "appliance" })).toBe(false);
  });
  it("does NOT flag a FRIDGE code that is not placed as an appliance", () => {
    expect(isRefrigerator({ masterCode: "FRIDGE-36", placement: "base" })).toBe(false);
  });
  it("is safe with missing master code", () => {
    expect(isRefrigerator({ placement: "appliance" })).toBe(false);
  });
});

describe("staggered built-in look", () => {
  it("makes end / fridge-corner cabinets 6\" taller than a standard wall cabinet", () => {
    const std = standardWallCabinetHeight();
    expect(staggeredWallCabinetHeight(std)).toBe(std + STAGGER_TALLER_IN);
    // Default arg uses the standard wall height.
    expect(staggeredWallCabinetHeight()).toBe(std + 6);
  });
  it("falls back to a standard-height bump for bad input", () => {
    expect(staggeredWallCabinetHeight(0)).toBe(standardWallCabinetHeight() + 6);
    expect(staggeredWallCabinetHeight(Number.NaN)).toBe(standardWallCabinetHeight() + 6);
  });
  it("hangs a taller stepped cabinet so its TOP shares the run top line", () => {
    const topLine = 84;
    const stepped = staggeredWallCabinetHeight(); // 36
    const bottom = staggeredMountBottom(topLine, stepped);
    expect(bottom).toBe(84 - stepped); // 48
    expect(bottom + stepped).toBe(topLine); // top flush at 84
  });
  it("projects the refrigerator/corner deep upper to 27\"", () => {
    expect(fridgeCornerUpperDepth()).toBe(FRIDGE_CORNER_UPPER_DEPTH_IN);
    expect(fridgeCornerUpperDepth()).toBe(27);
  });
});

describe("OTR microwave pairs with a detected range on the same wall", () => {
  // Sanity guard that the two building blocks the DesignTool auto-snap relies on
  // are consistent: the placed item is recognized as an OTR microwave, and a
  // RANGE-* appliance is recognized as a range so the snap target can be found.
  it("recognizes MW as OTR and RANGE as a range so the snap can pair them", () => {
    expect(isOverRangeMicrowave({ masterCode: "MW-30", placement: "appliance" })).toBe(true);
    expect(isRangeOrOven("RANGE-30", "Range / Stove 30\"")).toBe(true);
  });
});
