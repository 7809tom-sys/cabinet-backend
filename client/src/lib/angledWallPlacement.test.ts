import { describe, expect, it } from "vitest";
import type { RoomData, PlacedCabinet } from "./design";
import { cabinetCollisionDetail, countertopSurfaces, freeSegmentsOnWall, peninsulaRunEndpoints, peninsulaRunMaxLength, peninsulaRunOffsetAtPoint, wallLength, wallPlacementAt } from "./design";
import { buildDesignCabinetCartLines } from "./designCartLines";
import { buildMaterialsListRows } from "./designMaterialsList";

const angledRoom: RoomData = {
  width: 240,
  depth: 180,
  ceilingHeight: 96,
  vertices: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 120, y: 120 },
    { id: "c", x: 240, y: 120 },
    { id: "d", x: 240, y: 180 },
    { id: "e", x: 0, y: 180 },
  ],
  customWalls: [
    { id: "diag", startVertexId: "a", endVertexId: "b", label: "Angled wall", lockedAngle: 45 },
  ],
};

const peninsulaRoom: RoomData = {
  width: 144,
  depth: 144,
  ceilingHeight: 96,
  peninsulaRuns: [{
    id: "peninsula-90-right",
    parentWall: "top",
    startOffset: 48,
    turn: 90,
    direction: "right",
    length: 96,
    height: 34.5,
    label: "Peninsula · 90° right",
  }],
};

function peninsulaCabinet(uid: string, offset: number): PlacedCabinet {
  const spot = wallPlacementAt(offset, 30, 24, "peninsula-90-right" as any, peninsulaRoom);
  return {
    uid,
    cabinetId: 2,
    masterCode: "B-30",
    description: "Peninsula base cabinet",
    placement: "base",
    x: spot.x,
    y: spot.y,
    width: 30,
    depth: 24,
    height: 34.5,
    rotation: spot.rotation,
    wallId: spot.wallId,
    wallOffset: spot.wallOffset,
  };
}

function angledCabinet(uid: string, offset: number, placement: "base" | "wall" = "base"): PlacedCabinet {
  const width = 36;
  const depth = placement === "wall" ? 12 : 24;
  const spot = wallPlacementAt(offset, width, depth, "diag" as any, angledRoom);
  return {
    uid,
    cabinetId: 1,
    masterCode: placement === "wall" ? "W-36-30" : "B-36",
    description: "Angled run cabinet",
    placement,
    x: spot.x,
    y: spot.y,
    width,
    depth,
    height: placement === "wall" ? 30 : 34.5,
    rotation: spot.rotation,
    wallId: spot.wallId,
    wallOffset: spot.wallOffset,
  };
}

describe("locked 45-degree cabinet wall placement", () => {
  it("places base and wall cabinets with the exact locked rotation and wall identity", () => {
    const base = angledCabinet("base", 0, "base");
    const wall = angledCabinet("wall", 0, "wall");
    expect(base).toMatchObject({ rotation: 45, wallId: "diag", wallOffset: 0 });
    expect(wall).toMatchObject({ rotation: 45, wallId: "diag", wallOffset: 0 });
  });

  it("allows edge-to-edge angled cabinets and rejects a real along-run overlap", () => {
    const first = angledCabinet("one", 0);
    const butted = angledCabinet("two", 36);
    const overlap = angledCabinet("three", 35);
    expect(cabinetCollisionDetail(butted, [first])).toBeNull();
    expect(cabinetCollisionDetail(overlap, [first])?.penetration).toBeCloseTo(1);
  });

  it("releases an exact void after removal so the same cabinet can be returned", () => {
    const first = angledCabinet("one", 0);
    const second = angledCabinet("two", 36);
    const withRun = freeSegmentsOnWall("diag" as any, angledRoom, [first, second], [], 0.5, 0, "base");
    expect(withRun.some((segment) => segment.start === 36 && segment.length >= 36)).toBe(false);

    const afterRemoval = freeSegmentsOnWall("diag" as any, angledRoom, [first], [], 0.5, 0, "base");
    const releasedVoid = afterRemoval.find((segment) => segment.start <= 36 && segment.start + segment.length >= 72);
    expect(releasedVoid).toBeDefined();
    expect(releasedVoid!.length).toBeGreaterThanOrEqual(36);
  });

  it("keeps an angled cabinet in the same price and materials workflow as a straight cabinet", () => {
    const base = angledCabinet("priced-angle", 0);
    const lines = buildDesignCabinetCartLines({
      placed: [base],
      styleId: 77,
      distributorId: 11,
      tier: "homeowner",
      styleNameById: new Map([[77, "Test finish"]]),
      unitPriceFor: () => 250,
    });
    expect(lines).toEqual([expect.objectContaining({ masterCode: "B-36", qty: 1, unitPrice: 250 })]);
    expect(buildMaterialsListRows({ buildRows: [], pricingLines: lines })).toEqual([
      expect.objectContaining({ code: "B-36", qty: 1, unitPrice: 250, section: "cabinet" }),
    ]);
  });
});

describe("cabinet-supported peninsula runs", () => {
  it("anchors a 90-degree continuation at the measured parent-wall split point", () => {
    const run = peninsulaRoom.peninsulaRuns![0];
    expect(peninsulaRunEndpoints(run, peninsulaRoom)).toMatchObject({
      start: { x: 48, y: 0 },
      end: { x: 48, y: 96 },
    });
    expect(wallLength(run.id as any, peninsulaRoom)).toBe(96);
    expect(wallPlacementAt(0, 30, 24, run.id as any, peninsulaRoom)).toMatchObject({
      rotation: 90,
      wallId: run.id,
      wallOffset: 0,
    });
  });

  it("keeps exact 45-degree left and right continuations inside the room and bounds their pull", () => {
    const right45 = { ...peninsulaRoom.peninsulaRuns![0], turn: 45 as const, direction: "right" as const, startOffset: 72, length: 36 };
    const left45 = { ...right45, direction: "left" as const };
    expect(peninsulaRunEndpoints(right45, peninsulaRoom).end).toEqual({ x: 46.5, y: 25.5 });
    expect(peninsulaRunEndpoints(left45, peninsulaRoom).end).toEqual({ x: 97.5, y: 25.5 });
    expect(peninsulaRunMaxLength(right45, peninsulaRoom)).toBeLessThanOrEqual(102);
    expect(peninsulaRunMaxLength(left45, peninsulaRoom)).toBeLessThanOrEqual(102);
  });

  it("projects a catalog drop onto the active peninsula run rather than an outside room wall", () => {
    const run = peninsulaRoom.peninsulaRuns![0];
    expect(peninsulaRunOffsetAtPoint(run, peninsulaRoom, { x: 48, y: 63 })).toBe(63);
    expect(peninsulaRunOffsetAtPoint(run, peninsulaRoom, { x: 48, y: 220 })).toBe(96);
  });

  it("keeps a peninsula run empty until cabinets are placed, then reopens an exact removed void", () => {
    const first = peninsulaCabinet("pen-one", 0);
    const second = peninsulaCabinet("pen-two", 30);
    expect(cabinetCollisionDetail(second, [first])).toBeNull();
    const occupied = freeSegmentsOnWall("peninsula-90-right" as any, peninsulaRoom, [first, second], [], 0.5, 0, "base");
    expect(occupied.some((segment) => segment.start <= 30 && segment.start + segment.length >= 60)).toBe(false);
    const released = freeSegmentsOnWall("peninsula-90-right" as any, peninsulaRoom, [first], [], 0.5, 0, "base");
    expect(released.some((segment) => segment.start <= 30 && segment.start + segment.length >= 60)).toBe(true);
  });

  it("keeps peninsula base cabinets in normal counter, price, and materials workflows", () => {
    const base = peninsulaCabinet("pen-priced", 0);
    expect(countertopSurfaces([base], peninsulaRoom)).toEqual([
      expect.objectContaining({ kind: "base", rotation: 90 }),
    ]);
    const lines = buildDesignCabinetCartLines({
      placed: [base],
      styleId: 77,
      distributorId: 11,
      tier: "homeowner",
      styleNameById: new Map([[77, "Test finish"]]),
      unitPriceFor: () => 250,
    });
    expect(lines).toEqual([expect.objectContaining({ masterCode: "B-30", qty: 1, unitPrice: 250 })]);
    expect(buildMaterialsListRows({ buildRows: [], pricingLines: lines })).toEqual([
      expect.objectContaining({ code: "B-30", qty: 1, section: "cabinet" }),
    ]);
  });
});
