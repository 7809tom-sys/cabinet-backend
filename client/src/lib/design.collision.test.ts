import { describe, expect, it } from "vitest";
import { appendCollisionFreePlacements, DEFAULT_ROOM, elevationBox, fixtureIsOnCabinetFootprint, hasCollision, isMicrowaveOverRangePair, removeOverlappingPlacements, snapPosition, type PlacedCabinet } from "./design";

function placed(overrides: Partial<PlacedCabinet>): PlacedCabinet {
  return {
    uid: "item",
    cabinetId: 1,
    masterCode: "B33",
    description: "Base cabinet",
    placement: "base",
    x: 0,
    y: 0,
    width: 33,
    depth: 24,
    height: 34.5,
    rotation: 0,
    ...overrides,
  } as PlacedCabinet;
}

describe("design placement collision prevention", () => {
  it("rejects a 3DB15 drawer base that overlaps a B33 footprint", () => {
    const b33 = placed({ uid: "b33", masterCode: "B33", x: 0 });
    const drawerBase = placed({ uid: "3db15", masterCode: "3DB15", x: 18, width: 15 });
    expect(hasCollision(drawerBase, [b33])).toBe(true);
  });

  it("allows cabinet runs that merely butt edge-to-edge", () => {
    const b33 = placed({ uid: "b33", masterCode: "B33", x: 0 });
    const drawerBase = placed({ uid: "3db15", masterCode: "3DB15", x: 33, width: 15 });
    expect(hasCollision(drawerBase, [b33])).toBe(false);
  });

  it("identifies sinks attached to a sink base while leaving standalone sinks independent", () => {
    const sinkBase = placed({ uid: "sb36", masterCode: "SB36", description: "Sink Base 36", x: 24, y: 0, width: 36, depth: 24 });
    expect(fixtureIsOnCabinetFootprint({ x: 34, y: 5, width: 20, depth: 18 }, sinkBase)).toBe(true);
    expect(fixtureIsOnCabinetFootprint({ x: 80, y: 40, width: 20, depth: 18 }, sinkBase)).toBe(false);
  });

  it("rejects an appliance overlapping a base cabinet but preserves the sink-over-sink-base exception", () => {
    const b33 = placed({ uid: "b33", masterCode: "B33", x: 0 });
    const range = placed({ uid: "range", masterCode: "RANGE-30", placement: "appliance", x: 4, width: 30 });
    const sinkBase = placed({ uid: "sb36", masterCode: "SB36", description: "Sink Base 36", x: 0, width: 36 });
    const sink = placed({ uid: "sink", masterCode: "SINK-33", description: "Single bowl sink", placement: "appliance", x: 0, width: 33 });
    expect(hasCollision(range, [b33])).toBe(true);
    expect(hasCollision(sink, [sinkBase])).toBe(false);
  });

  it("allows a mounted over-range microwave above a range but still blocks the same microwave at floor height", () => {
    const range = placed({ uid: "range", masterCode: "RANGE-30", description: '30" Black Gas Range', placement: "appliance", x: 30, y: 0, width: 30, depth: 25, height: 36, mountBottom: 0 });
    const mountedMicrowave = placed({ uid: "mw-mounted", masterCode: "MW-30", description: '30" Over-Range Microwave', placement: "appliance", x: 30, y: 0, width: 30, depth: 15, height: 17, mountBottom: 54 });
    const floorMicrowave = { ...mountedMicrowave, uid: "mw-floor", mountBottom: 16 };
    const misalignedMicrowave = { ...mountedMicrowave, uid: "mw-misaligned", x: 35 };

    expect(elevationBox(range)).toEqual({ bottom: 0, height: 36 });
    expect(elevationBox(mountedMicrowave)).toEqual({ bottom: 54, height: 17 });
    expect(isMicrowaveOverRangePair(mountedMicrowave, range)).toBe(true);
    expect(hasCollision(mountedMicrowave, [range])).toBe(false);
    expect(hasCollision(floorMicrowave, [range])).toBe(true);
    expect(isMicrowaveOverRangePair(misalignedMicrowave, range)).toBe(false);
    expect(hasCollision(misalignedMicrowave, [range])).toBe(true);
  });

  it("does not append a base cabinet into an existing refrigerator opening", () => {
    const fridge = placed({ uid: "fridge", masterCode: "FRIDGE-36", placement: "appliance", x: 24, width: 36, height: 70 });
    const b24 = placed({ uid: "b24", masterCode: "B-24", x: 24, width: 24 });
    const result = appendCollisionFreePlacements([fridge], [b24]);
    expect(result.placed).toEqual([fridge]);
    expect(result.rejected).toEqual([b24]);
  });

  it("preserves left and right refrigerator enclosure panels beside the appliance", () => {
    const fridge = placed({ uid: "fridge", masterCode: "FRIDGE-36", description: "Refrigerator 36", placement: "appliance", x: 24, width: 36, height: 70 });
    const leftBase = placed({ uid: "left-base", masterCode: "B-24", description: "Base Cabinet 24", placement: "base", x: 0, width: 24, height: 34.5 });
    const leftPanel = placed({ uid: "left-panel", masterCode: "REPV-96", description: "Refrigerator End Panel 96\"H", placement: "tall", customProfile: "refrigerator-end-panel", x: 23.25, width: 0.75, depth: 27, height: 96 });
    const rightPanel = placed({ uid: "right-panel", masterCode: "REPV-96", description: "Refrigerator End Panel 96\"H", placement: "tall", customProfile: "refrigerator-end-panel", x: 60, width: 0.75, depth: 27, height: 96 });
    const result = appendCollisionFreePlacements([leftBase, fridge], [leftPanel, rightPanel]);
    expect(result.placed).toEqual([leftBase, fridge, leftPanel, rightPanel]);
    expect(result.rejected).toEqual([]);
  });

  it("keeps a refrigerator and removes a colliding base from a restored legacy layout", () => {
    const b24 = placed({ uid: "b24", masterCode: "B-24", x: 24, width: 24 });
    const fridge = placed({ uid: "fridge", masterCode: "FRIDGE-36", placement: "appliance", x: 24, width: 36, height: 70 });
    const result = removeOverlappingPlacements([b24, fridge]);
    expect(result.placed).toEqual([fridge]);
    expect(result.rejected).toEqual([b24]);
  });

  it("allows a base cabinet to butt against the refrigerator opening", () => {
    const fridge = placed({ uid: "fridge", masterCode: "FRIDGE-36", placement: "appliance", x: 24, width: 36, height: 70 });
    const b24 = placed({ uid: "b24", masterCode: "B-24", x: 0, width: 24 });
    expect(appendCollisionFreePlacements([fridge], [b24]).placed).toEqual([fridge, b24]);
  });

  it("snaps a cabinet flush to a refrigerator edge without creating a collision", () => {
    const fridge = placed({ uid: "fridge", masterCode: "FRIDGE-36", placement: "appliance", x: 24, width: 36, height: 70 });
    const b24 = placed({ uid: "b24", masterCode: "B-24", x: 1, width: 24 });
    const snapped = snapPosition(b24, DEFAULT_ROOM, [fridge]);
    const aligned = { ...b24, x: snapped.x, y: snapped.y };
    expect(snapped.snappedCabinet).toBe(true);
    expect(aligned.x + aligned.width).toBe(fridge.x);
    expect(hasCollision(aligned, [fridge])).toBe(false);
  });

  it("snaps a cabinet flush to an adjacent cabinet edge without changing its perpendicular position", () => {
    const b24 = placed({ uid: "b24", masterCode: "B-24", x: 24, y: 12, width: 24 });
    const b18 = placed({ uid: "b18", masterCode: "B-18", x: 7, y: 12, width: 18 });
    const snapped = snapPosition(b18, DEFAULT_ROOM, [b24]);
    expect(snapped.snappedCabinet).toBe(true);
    expect(snapped.x + b18.width).toBe(b24.x);
    expect(snapped.y).toBe(12);
  });
});
