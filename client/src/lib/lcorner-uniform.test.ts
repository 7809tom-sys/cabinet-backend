import { describe, it, expect } from "vitest";
import {
  placedFootprint,
  cornerLegRatioForPlaced,
  cornerClipPath,
  cornerRotationForPlaced,
  type PlacedCabinet,
  type RoomData,
} from "./design";

// Minimal placed-cabinet factory for an L-shaped corner BASE cabinet.
function mkCorner(masterCode: string, description: string, width: number, x = 0, y = 0): PlacedCabinet {
  return {
    uid: masterCode,
    cabinetId: 1,
    masterCode,
    description,
    category: "Base",
    subCategory: "Corner Base",
    placement: "base",
    x,
    y,
    width,
    nominalWidth: width,
    depth: width,
    nominalDepth: width,
    height: 34.5,
    nominalHeight: 34.5,
    rotation: 0,
    numberOfDoors: 1,
    numberOfDrawers: 0,
    catalogImageUrl: null,
    pullMin: null,
    pullMax: null,
    styleId: null,
  } as unknown as PlacedCabinet;
}

describe("L-corner cabinets render with a uniform footprint", () => {
  const cdb = mkCorner("CDB-36", "Corner Drawer Base Cabinet three drawers", 36);
  const erb36 = mkCorner("ERB-36", "36\" Base Easy Reach Cabinet", 36);
  const erb33 = mkCorner("ERB-33", "33\" Base Easy Reach Cabinet", 33);

  it("all base L-corners are a 36in square box regardless of nominal width", () => {
    expect(placedFootprint(cdb)).toEqual({ w: 36, d: 36 });
    expect(placedFootprint(erb36)).toEqual({ w: 36, d: 36 });
    // ERB-33's nominal width is 33, but it must still render as the standard 36 box.
    expect(placedFootprint(erb33)).toEqual({ w: 36, d: 36 });
  });

  it("all base L-corners share the same leg ratio (24in legs on a 36in box)", () => {
    const r = cornerLegRatioForPlaced({ width: 36, placement: "base" });
    expect(r).toBeCloseTo(24 / 36, 5);
    expect(cornerLegRatioForPlaced({ width: 33, placement: "base" })).toBeCloseTo(r, 5);
    expect(cornerLegRatioForPlaced({ width: 36, placement: "base" })).toBeCloseTo(r, 5);
  });

  it("ERB and CDB produce byte-identical clip-paths at the same corner", () => {
    const room: RoomData = { width: 144, depth: 120, ceilingHeight: 96 } as RoomData;
    const ratio = cornerLegRatioForPlaced({ width: 36, placement: "base" });
    const rotCdb = cornerRotationForPlaced(cdb, room);
    const rotErb33 = cornerRotationForPlaced(erb33, room);
    expect(rotCdb).toBe(rotErb33);
    expect(cornerClipPath(rotErb33, ratio)).toBe(cornerClipPath(rotCdb, ratio));
  });
});
