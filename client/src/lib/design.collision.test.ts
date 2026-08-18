import { describe, expect, it } from "vitest";
import { appendCollisionFreePlacements, DEFAULT_ROOM, elevationBox, fixtureIsOnCabinetFootprint, hasCollision, isMicrowaveOverRangePair, makeSinkForCabinet, mountedMicrowaveOverRangeSpot, normalizeRefrigeratorPanelSeams, normalizeSinkFixturesToBases, overRangeMicrowaveAttachment, preferredRangeForOverRangeMicrowave, removeOverlappingPlacements, snapPosition, type PlacedCabinet } from "./design";

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

  it("centers and turns a sink lengthwise within a right-wall sink base", () => {
    const rightSinkBase = placed({ uid: "right-sb36", masterCode: "SB36", description: "Sink Base 36", x: 120, y: 42, width: 36, depth: 24, rotation: 90 });
    const installed = makeSinkForCabinet("single", rightSinkBase, DEFAULT_ROOM);
    expect(installed.wallSide).toBe("right");
    expect(installed.width).toBe(18);
    expect(installed.depth).toBe(25);
    expect(installed.cabinetUid).toBe("right-sb36");
    const normalized = normalizeSinkFixturesToBases([{ ...installed, wallSide: undefined, width: 25, depth: 18, sourceWidth: undefined, sourceDepth: undefined }], [rightSinkBase], DEFAULT_ROOM);
    expect(normalized[0]).toMatchObject({ wallSide: "right", width: 18, depth: 25, cabinetUid: "right-sb36" });
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

  it("allows the same centered mounted MW-30 pair on a rotated right-wall range", () => {
    const range = placed({ uid: "range-right", masterCode: "RANGE-30", description: '30" Black Gas Range', placement: "appliance", x: 120, y: 40, width: 30, depth: 25, height: 36, mountBottom: 0, rotation: 90 });
    const microwave = placed({ uid: "mw-right", masterCode: "MW-30", description: '30" Over-Range Microwave', placement: "appliance", x: 129, y: 40, width: 30, depth: 15, height: 17, mountBottom: 54, rotation: 90 });
    expect(isMicrowaveOverRangePair(microwave, range)).toBe(true);
    expect(hasCollision(microwave, [range])).toBe(false);
  });

  it("pins a new MW-30 to the exact range center on top and right walls", () => {
    const topRange = placed({ uid: "top-range", masterCode: "RANGE-30", placement: "appliance", x: 42, y: 0, width: 30, depth: 25, height: 34.5, rotation: 0 });
    const rightRange = placed({ uid: "right-range", masterCode: "RANGE-30", placement: "appliance", x: 119, y: 42, width: 30, depth: 25, height: 34.5, rotation: 90 });
    expect(mountedMicrowaveOverRangeSpot({ width: 30, depth: 15 }, topRange, DEFAULT_ROOM)).toMatchObject({ x: 42, y: 0, rotation: 0 });
    expect(mountedMicrowaveOverRangeSpot({ width: 30, depth: 15 }, rightRange, DEFAULT_ROOM)).toMatchObject({ x: 129, y: 42, rotation: 90 });
  });

  it("attaches a palette-added MW-30 to the selected range before considering a floating canvas drop point", () => {
    const topRange = placed({ uid: "top-range", masterCode: "RANGE-30", placement: "appliance", x: 42, y: 0, width: 30, depth: 25, height: 34.5, rotation: 0 });
    const rightRange = placed({ uid: "right-range", masterCode: "RANGE-30", placement: "appliance", x: 119, y: 42, width: 30, depth: 25, height: 34.5, rotation: 90 });
    const selected = preferredRangeForOverRangeMicrowave([topRange, rightRange], DEFAULT_ROOM, "top", "top-range", { x: 60, y: 60 });
    const activeWall = preferredRangeForOverRangeMicrowave([topRange, rightRange], DEFAULT_ROOM, "top", null, { x: 60, y: 60 });
    expect(selected?.uid).toBe("top-range");
    expect(activeWall?.uid).toBe("top-range");
    expect(mountedMicrowaveOverRangeSpot({ width: 30, depth: 15 }, selected!, DEFAULT_ROOM)).toMatchObject({ x: 42, y: 0, rotation: 0 });
    expect(overRangeMicrowaveAttachment([topRange, rightRange], DEFAULT_ROOM, "top", "top-range", { x: 60, y: 60 }, { width: 30, depth: 15 })).toMatchObject({ range: topRange, spot: { x: 42, y: 0, rotation: 0 } });
    expect(overRangeMicrowaveAttachment([], DEFAULT_ROOM, "top", null, { x: 60, y: 60 }, { width: 30, depth: 15 })).toBeNull();
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

  it("re-seats saved cabinet runs outside refrigerator panel seams on both sides", () => {
    const leftBase = placed({ uid: "left-base", masterCode: "B-12", x: 36, width: 12, height: 34.5 });
    const fridge = placed({ uid: "fridge", masterCode: "FRIDGE-36", placement: "appliance", x: 48, width: 36, depth: 25, height: 70 });
    const leftPanel = placed({ uid: "left-panel", masterCode: "REPV-96", description: "Refrigerator End Panel", placement: "tall", x: 46.5, width: 1.5, depth: 25, height: 96 });
    const rightPanel = placed({ uid: "right-panel", masterCode: "REPV-96", description: "Refrigerator End Panel", placement: "tall", x: 84, width: 1.5, depth: 25, height: 96 });
    const rightBase = placed({ uid: "right-base", masterCode: "3-DB24", x: 84, width: 24, height: 34.5 });
    const normalized = normalizeRefrigeratorPanelSeams([leftBase, fridge, leftPanel, rightPanel, rightBase], DEFAULT_ROOM);
    expect(normalized.find((item) => item.uid === "left-base")?.x).toBe(34.5);
    expect(normalized.find((item) => item.uid === "right-base")?.x).toBe(85.5);
    expect(normalized.find((item) => item.uid === "left-panel")?.x).toBe(46.5);
    expect(normalized.find((item) => item.uid === "right-panel")?.x).toBe(84);
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
