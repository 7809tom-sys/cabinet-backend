import { describe, expect, it } from "vitest";
import { normalizePlacedWallCabinetSkuDimensions, removeOverlappingPlacements, resolvedDesignCabinetDimensions, wallCabinetSkuDimensions, type DesignCabinet, type PlacedCabinet } from "./design";

function wallCabinet(masterCode: string, dimensions: Partial<Pick<DesignCabinet, "width" | "height" | "depth">> = {}): DesignCabinet {
  return {
    id: 1,
    masterCode,
    description: "Wall cabinet",
    category: "Wall",
    subCategory: null,
    width: "12",
    height: "24",
    depth: "12",
    placement: "wall",
    numberOfDoors: 2,
    numberOfDrawers: 0,
    isCornerCabinet: false,
    ...dimensions,
  };
}

describe("authoritative wall cabinet SKU dimensions", () => {
  it.each([
    ["W-36-24", { width: 36, height: 24, depth: 12 }],
    ["HONEY CORE W-36-24", { width: 36, height: 24, depth: 12 }],
    ["WR3624", { width: 36, height: 24, depth: 24 }],
    ["W302424", { width: 30, height: 24, depth: 24 }],
    ["W3012GD", { width: 30, height: 12, depth: 12 }],
    ["W3624", { width: 36, height: 24, depth: 12 }],
  ])("parses %s", (masterCode, expected) => {
    expect(wallCabinetSkuDimensions(masterCode)).toEqual(expected);
  });

  it("overrides stale positive catalog columns before W-36-24 is placed or snapped", () => {
    expect(resolvedDesignCabinetDimensions(wallCabinet("W-36-24", { width: "12", height: "24", depth: "12" })))
      .toEqual({ width: 36, height: 24, depth: 12 });
  });

  it("leaves non-dimensional and non-wall catalog families on their stored dimensions", () => {
    expect(wallCabinetSkuDimensions("AW1242")).toBeNull();
    expect(resolvedDesignCabinetDimensions({ ...wallCabinet("B-36", { width: "36", height: "34.5", depth: "24" }), placement: "base" }))
      .toEqual({ width: 36, height: 34.5, depth: 24 });
  });

  it("repairs a stale saved W-36-24 footprint before restore collision cleanup", () => {
    const stale = {
      uid: "saved-w-36-24", cabinetId: 1, masterCode: "W-36-24", description: "Wall cabinet",
      placement: "wall", x: 0, y: 0, width: 12, height: 24, depth: 12, rotation: 0,
    } as PlacedCabinet;
    const restored = removeOverlappingPlacements([stale]).placed[0];
    expect(restored).toMatchObject({ width: 36, nominalWidth: 36, height: 24, nominalHeight: 24, depth: 12, nominalDepth: 12 });
  });

  it("preserves an intentional custom width while retaining the SKU as its nominal catalog size", () => {
    const custom = {
      uid: "custom-w-36-24", cabinetId: 1, masterCode: "W-36-24", description: "Custom wall cabinet",
      placement: "wall", x: 0, y: 0, width: 35.5, nominalWidth: 36, height: 24, nominalHeight: 24, depth: 12, nominalDepth: 12, rotation: 0,
    } as PlacedCabinet;
    expect(normalizePlacedWallCabinetSkuDimensions(custom)).toMatchObject({ width: 35.5, nominalWidth: 36, height: 24, depth: 12 });
  });
});
