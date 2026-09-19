import { describe, expect, it } from "vitest";
import type { RoomData, PlacedCabinet } from "./design";
import { alternateWallPlacementRecommendation, autoSnapCabinetToNearbyWall, blindCornerSnapInfo, cabinetCollisionDetail, cabinetCornerPlacementInfo, cabinetPlacementCollisionDetail, cabinetWallRunLength, cabinetWallRunSegment, clampCabinetToRoom, collisionReason, containCabinetOnDrawnWalls, countertopArea, countertopSurfacePlanPolygon, countertopSurfaces, firstCollisionFreePeninsulaPlacement, freeSegmentsOnWall, isCustomRoomWall, nextAvailableRoomCornerPlacement, normalizeLegacyPeninsulaCabinets, paletteActiveWallPlacement, PENINSULA_INSIDE_CORNER_CLEARANCE_IN, peninsulaAutomaticStartOffset, peninsulaCountertopSeatingOverhang, peninsulaCountertopSurface, peninsulaCountertopWaterfallEnd, peninsulaRunEndpoints, peninsulaRunHitAtPoint, peninsulaRunMaxLength, peninsulaRunOffsetAtPoint, peninsulaRunStartOffsetAtPoint, placedFootprint, removePeninsulaRun, retainedWallSegmentForSplit, selectedCornerBaseWallPlacement, shouldBlockPlacementCollision, snapWallCabinetToOwningWall, STD, wallLength, wallPlacementAt } from "./design";
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

const builderRoom: RoomData = {
  width: 120,
  depth: 96,
  ceilingHeight: 96,
  vertices: [
    { id: "builder-a", x: 0, y: 0 },
    { id: "builder-b", x: 120, y: 0 },
    { id: "builder-c", x: 120, y: 96 },
    { id: "builder-d", x: 0, y: 96 },
  ],
  customWalls: [
    { id: "builder-top", startVertexId: "builder-a", endVertexId: "builder-b", label: "Wall 1" },
    { id: "builder-right", startVertexId: "builder-b", endVertexId: "builder-c", label: "Wall 2" },
    { id: "builder-bottom", startVertexId: "builder-c", endVertexId: "builder-d", label: "Wall 3" },
    { id: "builder-left", startVertexId: "builder-d", endVertexId: "builder-a", label: "Wall 4" },
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

describe("continuous builder custom wall placement", () => {
  it("treats every straight generated wall as an explicit cabinet-ready run", () => {
    expect(isCustomRoomWall(builderRoom, "builder-top")).toBe(true);
    expect(isCustomRoomWall(builderRoom, "builder-right")).toBe(true);
    expect(wallLength("builder-bottom" as any, builderRoom)).toBe(120);
    expect(freeSegmentsOnWall("builder-left" as any, builderRoom, [], [], 0.5, 0, "base")).toEqual([{ start: 0, length: 96 }]);
  });

  it("places cabinets against all four custom wall bearings with exact wall ownership", () => {
    expect(wallPlacementAt(0, 30, 24, "builder-top" as any, builderRoom)).toMatchObject({ rotation: 0, wallId: "builder-top", wallOffset: 0 });
    expect(wallPlacementAt(0, 30, 24, "builder-right" as any, builderRoom)).toMatchObject({ rotation: 90, wallId: "builder-right", wallOffset: 0 });
    expect(wallPlacementAt(0, 30, 24, "builder-bottom" as any, builderRoom)).toMatchObject({ rotation: 180, wallId: "builder-bottom", wallOffset: 0 });
    expect(wallPlacementAt(0, 30, 24, "builder-left" as any, builderRoom)).toMatchObject({ rotation: 270, wallId: "builder-left", wallOffset: 0 });
  });

  it("reserves a seated ERB corner cabinet's adjoining custom-wall leg before placing a straight cabinet", () => {
    const topRightSpot = wallPlacementAt(84, 36, 24, "builder-top" as any, builderRoom);
    const erb: PlacedCabinet = {
      uid: "erb36-top-right",
      cabinetId: 36,
      masterCode: "ERB36",
      description: "Easy Reach Corner Base 36",
      placement: "base",
      ...topRightSpot,
      rotation: 90,
      width: 36,
      depth: 24,
      height: 34.5,
      wallId: "builder-top",
      wallOffset: 84,
    };
    expect(freeSegmentsOnWall("builder-right" as any, builderRoom, [erb], [], 0.5, 0, "base")).toEqual([
      { start: 24, length: 72 },
    ]);

    const b12Spot = wallPlacementAt(0, 12, 24, "builder-right" as any, builderRoom);
    const b12: PlacedCabinet = {
      uid: "b12-over-erb",
      cabinetId: 12,
      masterCode: "B12",
      description: "12 inch Base Cabinet",
      placement: "base",
      ...b12Spot,
      width: 12,
      depth: 24,
      height: 34.5,
      wallId: "builder-right",
      wallOffset: 0,
    };
    expect(cabinetPlacementCollisionDetail(b12, [erb], builderRoom)?.cabinet.uid).toBe(erb.uid);
    expect(shouldBlockPlacementCollision(b12, [erb])).toBe(true);
  });

  it("snaps an ERB corner cabinet to the first available right-angle vertex in advanced continuous-wall mode", () => {
    const moving: PlacedCabinet = {
      uid: "erb36-preview",
      cabinetId: 36,
      masterCode: "ERB36",
      description: "Easy Reach Corner Base 36",
      placement: "base",
      x: 0,
      y: 0,
      width: 36,
      depth: 24,
      height: 34.5,
      rotation: 0,
    };
    expect(nextAvailableRoomCornerPlacement(moving, "builder-top" as any, { ...builderRoom, openWallPath: true }, [])).toMatchObject({
      wallId: "builder-top",
      wallOffset: 0,
      rotation: 0,
    });
  });

  it("keeps real-corner snapping when the continuous wall path is closed", () => {
    const moving: PlacedCabinet = {
      uid: "erb36-closed-room-preview",
      cabinetId: 36,
      masterCode: "ERB36",
      description: "Easy Reach Corner Base 36",
      placement: "base",
      x: 0,
      y: 0,
      width: 36,
      depth: 24,
      height: 34.5,
      rotation: 0,
    };
    // Wall Builder uses openWallPath=false once a measured chain closes. The
    // height on each generated wall identifies it as the advanced authoring
    // model, not a beginner seeded polygon.
    const closedWallBuilderRoom: RoomData = {
      ...builderRoom,
      openWallPath: false,
      customWalls: builderRoom.customWalls.map((wall) => ({ ...wall, height: 96 })),
    };
    expect(nextAvailableRoomCornerPlacement(moving, "builder-top" as any, closedWallBuilderRoom, [])).toMatchObject({
      wallId: "builder-top",
      wallOffset: 0,
      rotation: 0,
    });
  });

  it("lets a dragged corner cabinet target the nearest open real corner rather than its old wall", () => {
    const moving: PlacedCabinet = {
      uid: "erb36-drag-preview",
      cabinetId: 36,
      masterCode: "ERB36",
      description: "Easy Reach Corner Base 36",
      placement: "base",
      x: 0,
      y: 0,
      width: 36,
      depth: 24,
      height: 34.5,
      rotation: 0,
      wallId: "builder-top",
      wallOffset: 0,
    };
    const room = { ...builderRoom, openWallPath: true };
    expect(nextAvailableRoomCornerPlacement(moving, "builder-top" as any, room, [], { x: 120, y: 96 })).toMatchObject({
      wallId: "builder-right",
      wallOffset: 60,
      rotation: 90,
    });
    expect(nextAvailableRoomCornerPlacement(moving, "builder-top" as any, room, [], { x: 60, y: 48 })).toBeNull();
  });

  it("snaps an ERB to a real 90-degree vertex made from diagonal continuous walls without an 11-inch gap", () => {
    const diagonalRightAngleRoom: RoomData = {
      width: 180,
      depth: 180,
      ceilingHeight: 96,
      openWallPath: true,
      vertices: [
        { id: "diagonal-a", x: 0, y: 0 },
        { id: "diagonal-corner", x: 100, y: 100 },
        { id: "diagonal-b", x: 50, y: 150 },
      ],
      customWalls: [
        { id: "diagonal-first", startVertexId: "diagonal-a", endVertexId: "diagonal-corner", label: "Wall 1", lockedAngle: 45 },
        { id: "diagonal-second", startVertexId: "diagonal-corner", endVertexId: "diagonal-b", label: "Wall 2", lockedAngle: 45 },
      ],
    };
    const erb: PlacedCabinet = {
      uid: "diagonal-erb36-preview",
      cabinetId: 36,
      masterCode: "ERB36",
      description: "Easy Reach Corner Base 36",
      placement: "base",
      x: 0,
      y: 0,
      width: 36,
      depth: 24,
      height: 34.5,
      rotation: 0,
    };
    const spot = nextAvailableRoomCornerPlacement(erb, "diagonal-second" as any, diagonalRightAngleRoom, []);
    expect(spot).toMatchObject({ wallId: "diagonal-second", wallOffset: 0 });
    // The real ERB36 body is a 36×36 physical corner envelope even though
    // catalog depth can be recorded as 24". Its rotated bounding box is placed
    // so the body—not just an abstract wall offset—reaches the vertex at 100,100.
    expect(spot!.x).toBeCloseTo(100 - 36 * Math.SQRT2, 8);
    expect(spot!.y).toBeCloseTo(100 - 36 * Math.SQRT2 / 2, 8);
    expect(spot!.rotation).toBe(135);
    expect(cabinetCornerPlacementInfo({ ...erb, ...spot!, wallId: spot!.wallId, wallOffset: spot!.wallOffset }, diagonalRightAngleRoom)).toEqual({
      angle: 90,
      placement: "flush",
      clearanceIn: 0,
    });
  });

  it("blocks a B12 from entering the adjoining diagonal leg reserved by a seated ERB36", () => {
    const diagonalRightAngleRoom: RoomData = {
      width: 180,
      depth: 180,
      ceilingHeight: 96,
      openWallPath: true,
      vertices: [
        { id: "diagonal-a", x: 0, y: 0 },
        { id: "diagonal-corner", x: 100, y: 100 },
        { id: "diagonal-b", x: 50, y: 150 },
      ],
      customWalls: [
        { id: "diagonal-first", startVertexId: "diagonal-a", endVertexId: "diagonal-corner", label: "Wall 1", lockedAngle: 45, height: 96 },
        { id: "diagonal-second", startVertexId: "diagonal-corner", endVertexId: "diagonal-b", label: "Wall 2", lockedAngle: 45, height: 96 },
      ],
    };
    const erbSeed: PlacedCabinet = {
      uid: "diagonal-erb36-seated",
      cabinetId: 36,
      masterCode: "ERB36",
      description: "Easy Reach Corner Base 36",
      placement: "base",
      x: 0,
      y: 0,
      width: 36,
      depth: 24,
      height: 34.5,
      rotation: 0,
    };
    const erbSpot = nextAvailableRoomCornerPlacement(erbSeed, "diagonal-second" as any, diagonalRightAngleRoom, []);
    expect(erbSpot).toMatchObject({ wallId: "diagonal-second", wallOffset: 0 });
    const erb: PlacedCabinet = { ...erbSeed, ...erbSpot!, wallId: erbSpot!.wallId, wallOffset: erbSpot!.wallOffset };
    const b12Spot = wallPlacementAt(wallLength("diagonal-first" as any, diagonalRightAngleRoom) - 12, 12, 24, "diagonal-first" as any, diagonalRightAngleRoom);
    const b12: PlacedCabinet = {
      uid: "diagonal-b12-over-erb",
      cabinetId: 12,
      masterCode: "B12",
      description: "12 inch Base Cabinet",
      placement: "base",
      ...b12Spot,
      width: 12,
      depth: 24,
      height: 34.5,
      wallId: b12Spot.wallId,
      wallOffset: b12Spot.wallOffset,
    };
    expect(cabinetPlacementCollisionDetail(b12, [erb], diagonalRightAngleRoom)?.cabinet.uid).toBe(erb.uid);
    expect(shouldBlockPlacementCollision(b12, [erb], false, diagonalRightAngleRoom)).toBe(true);

    // The physically seated ERB36 reserves the diagonal's actual corner body;
    // leave the exact measured clear span before expecting a B12 to fit.
    const clearB12Spot = wallPlacementAt(wallLength("diagonal-first" as any, diagonalRightAngleRoom) - 72, 12, 24, "diagonal-first" as any, diagonalRightAngleRoom);
    const clearB12 = { ...b12, ...clearB12Spot, wallOffset: clearB12Spot.wallOffset };
    expect(shouldBlockPlacementCollision(clearB12, [erb], false, diagonalRightAngleRoom)).toBe(false);
  });

  it("gives ERB36 collision guidance and aligns a selected upper to the same measured corner", () => {
    const room: RoomData = {
      ...builderRoom,
      openWallPath: true,
      customWalls: builderRoom.customWalls.map((wall) => ({ ...wall, height: 96 })),
    };
    const erbSeed: PlacedCabinet = {
      uid: "erb36-upper-anchor",
      cabinetId: 36,
      masterCode: "ERB36",
      description: "Easy Reach Corner Base 36",
      placement: "base",
      x: 0,
      y: 0,
      width: 36,
      depth: 24,
      height: 34.5,
      rotation: 0,
    };
    const erbSpot = nextAvailableRoomCornerPlacement(erbSeed, "builder-top" as any, room, []);
    expect(erbSpot).toMatchObject({ wallId: "builder-top", wallOffset: 0 });
    const erb: PlacedCabinet = { ...erbSeed, ...erbSpot!, wallId: erbSpot!.wallId, wallOffset: erbSpot!.wallOffset };
    const upperSpot = selectedCornerBaseWallPlacement(erb, room, 24, 12, 30, [erb], []);
    expect(upperSpot).toMatchObject({ x: 0, y: 0, rotation: 0, wallId: "builder-top", wallOffset: 0 });

    const b12: PlacedCabinet = {
      uid: "b12-over-erb",
      cabinetId: 12,
      masterCode: "B12",
      description: "12 inch Base Cabinet",
      placement: "base",
      x: 6,
      y: 0,
      width: 12,
      depth: 24,
      height: 34.5,
      rotation: 0,
      wallId: "builder-top",
      wallOffset: 6,
    };
    expect(collisionReason(b12, [erb], room)).toContain("Corner protected: ERB36 is snapped into this corner.");
  });

  it("confirms a seated BBC42 blind corner and protects its cabinet body and filler zone", () => {
    const room: RoomData = { ...builderRoom, openWallPath: true };
    const bbc42: PlacedCabinet = {
      uid: "bbc42-corner-anchor",
      cabinetId: 42,
      masterCode: "BBC42",
      description: "42 inch Blind Corner Base Cabinet",
      placement: "base",
      x: 0,
      y: 0,
      width: 42,
      depth: 24,
      height: 34.5,
      rotation: 0,
      wallId: "builder-top",
      wallOffset: 0,
      pullMin: 3,
      pullMax: 6,
    };
    expect(blindCornerSnapInfo(bbc42, room)).toEqual({ angle: 90, placement: "flush", clearanceIn: 0 });

    const b12: PlacedCabinet = {
      uid: "b12-over-bbc42",
      cabinetId: 12,
      masterCode: "B12",
      description: "12 inch Base Cabinet",
      placement: "base",
      x: 30,
      y: 0,
      width: 12,
      depth: 24,
      height: 34.5,
      rotation: 0,
      wallId: "builder-top",
      wallOffset: 30,
    };
    expect(cabinetPlacementCollisionDetail(b12, [bbc42], room)?.cabinet.uid).toBe(bbc42.uid);
    expect(collisionReason(b12, [bbc42], room)).toContain("Corner protected: BBC42 is snapped into this blind corner.");
  });

  it("magnetically snaps a nearby cabinet to a straight custom wall instead of the polygon bounding box", () => {
    const moving: PlacedCabinet = {
      uid: "builder-moving",
      cabinetId: 9,
      masterCode: "B-30",
      description: "Builder wall base",
      placement: "base",
      x: 40,
      y: 3,
      width: 30,
      depth: 24,
      height: 34.5,
      rotation: 0,
    };
    expect(autoSnapCabinetToNearbyWall(moving, builderRoom, [], [], 6)).toMatchObject({ wallId: "builder-top", rotation: 0 });
  });

	  it("recommends another user-drawn wall instead of an invisible graph boundary", () => {
	    const recommendation = alternateWallPlacementRecommendation(
	      "builder-top" as any,
	      builderRoom,
	      [],
	      [],
	      30,
	      24,
	      "base",
	    );
	    expect(recommendation).not.toBeNull();
	    expect(builderRoom.customWalls?.some((wall) => wall.id === recommendation!.side)).toBe(true);
	    expect(["top", "right", "bottom", "left"]).not.toContain(recommendation!.side);
	  });

  it("recovers a far-dragged cabinet onto its owning drawn wall and clamps it before the wall end", () => {
    const farDragged: PlacedCabinet = {
      uid: "far-dragged-db18",
      cabinetId: 18,
      masterCode: "3-DB18",
      description: "Drawer base 18",
      placement: "base",
      x: 500,
      y: 400,
      width: 18,
      depth: 24,
      height: 34.5,
      rotation: 270,
      wallId: "builder-top" as any,
      wallOffset: 500,
    };
    const contained = containCabinetOnDrawnWalls(farDragged, builderRoom);
    expect(contained).toMatchObject({
      wallId: "builder-top",
      wallOffset: 102,
      x: 102,
      y: 0,
      rotation: 0,
    });
  });

  it("replaces stale graph-square ownership with the closest real user-drawn wall", () => {
    const staleGraphCabinet: PlacedCabinet = {
      uid: "stale-graph-db18",
      cabinetId: 18,
      masterCode: "3-DB18",
      description: "Drawer base 18",
      placement: "base",
      x: -48,
      y: 30,
      width: 18,
      depth: 24,
      height: 34.5,
      rotation: 0,
      wallId: "top",
    };
    const contained = clampCabinetToRoom(staleGraphCabinet, builderRoom);
    expect(builderRoom.customWalls?.some((wall) => wall.id === contained.wallId)).toBe(true);
    expect(["top", "right", "bottom", "left"]).not.toContain(contained.wallId);
    expect(contained.wallOffset).toBeGreaterThanOrEqual(0);
    expect((contained.wallOffset ?? 0) + contained.width).toBeLessThanOrEqual(wallLength(contained.wallId as any, builderRoom));
  });
});

describe("parent-wall termination at a peninsula attachment", () => {
  it("previews the exact longer wall section before a Compass split commits", () => {
    expect(retainedWallSegmentForSplit("top", peninsulaRoom, 48)).toEqual({ start: 48, length: 96 });
    expect(retainedWallSegmentForSplit("top", peninsulaRoom, 120)).toEqual({ start: 0, length: 120 });
    expect(retainedWallSegmentForSplit("top", peninsulaRoom, 72)).toEqual({ start: 0, length: 72 });
  });

  it("keeps the full room span for attachment editing and retains the longer wall section after the Compass split", () => {
    expect(wallLength("top", peninsulaRoom)).toBe(144);
    expect(cabinetWallRunSegment("top", peninsulaRoom)).toEqual({ start: 48, length: 96 });
    expect(cabinetWallRunLength("top", peninsulaRoom)).toBe(96);
    expect(freeSegmentsOnWall("top", peninsulaRoom, [], [], 0.5, 0, "base")).toEqual([{ start: 48, length: 96 }]);
  });

  it("clamps new top-wall cabinets inside the retained longer segment instead of placing them in the removed short section", () => {
    const spot = wallPlacementAt(0, 30, 24, "top", peninsulaRoom);
    expect(spot).toMatchObject({ x: 48, y: 0, rotation: 0 });
  });

  it("retains the start-side section when it is longer than the end-side section", () => {
    const nearEnd: RoomData = {
      ...peninsulaRoom,
      peninsulaRuns: peninsulaRoom.peninsulaRuns?.map((run) => ({ ...run, startOffset: 120 })),
    };
    expect(cabinetWallRunSegment("top", nearEnd)).toEqual({ start: 0, length: 120 });
    expect(freeSegmentsOnWall("top", nearEnd, [], [], 0.5, 0, "base")).toEqual([{ start: 0, length: 120 }]);
  });

  it("retains the full parent wall when a primary run explicitly keeps it", () => {
    const retained: RoomData = {
      ...peninsulaRoom,
      peninsulaRuns: peninsulaRoom.peninsulaRuns?.map((run) => ({ ...run, terminatesParentWall: false })),
    };
    expect(cabinetWallRunSegment("top", retained)).toEqual({ start: 0, length: 144 });
    expect(cabinetWallRunLength("top", retained)).toBe(144);
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

  it("moves a joined peninsula endpoint only along its adjoining parent wall", () => {
    const run = peninsulaRoom.peninsulaRuns![0];
    expect(peninsulaRunStartOffsetAtPoint(run, peninsulaRoom, { x: 84.125, y: 36 })).toBe(84.125);
    expect(peninsulaRunStartOffsetAtPoint(run, peninsulaRoom, { x: -20, y: 36 })).toBe(0);
    expect(peninsulaRunStartOffsetAtPoint(run, peninsulaRoom, { x: 200, y: 36 })).toBe(138);
  });

  it("seats a cabinet back against either selected face of a two-sided peninsula", () => {
    const run = peninsulaRoom.peninsulaRuns![0];
    const left = wallPlacementAt(0, 30, 24, run.id as any, peninsulaRoom, "left");
    const right = wallPlacementAt(0, 30, 24, run.id as any, peninsulaRoom, "right");
    expect(left).toMatchObject({ x: 24, y: 0, rotation: 90, wallId: run.id, peninsulaSide: "left" });
    expect(right).toMatchObject({ x: 48, y: 0, rotation: 270, wallId: run.id, peninsulaSide: "right" });

    const rightDefaultRoom: RoomData = {
      ...peninsulaRoom,
      peninsulaRuns: [{ ...run, cabinetSide: "right" }],
    };
    expect(wallPlacementAt(0, 30, 24, run.id as any, rightDefaultRoom)).toMatchObject({ rotation: 270, peninsulaSide: "right" });
  });

  it("keeps exact 45-degree left and right continuations inside the room and bounds their pull", () => {
    const parent = { ...peninsulaRoom.peninsulaRuns![0], startOffset: 72, length: 36 };
    const right45 = { id: "right-45-end", parentRunId: parent.id, startOffset: 0, turn: 45 as const, direction: "right" as const, length: 36, height: 34.5 };
    const left45 = { ...right45, id: "left-45-end", direction: "left" as const };
    const rightRoom: RoomData = { ...peninsulaRoom, peninsulaRuns: [parent, right45] };
    const leftRoom: RoomData = { ...peninsulaRoom, peninsulaRuns: [parent, left45] };
    expect(peninsulaRunEndpoints(right45, rightRoom).end).toEqual({ x: 46.5, y: 61.5 });
    expect(peninsulaRunEndpoints(left45, leftRoom).end).toEqual({ x: 97.5, y: 61.5 });
    expect(peninsulaRunMaxLength(right45, rightRoom)).toBeLessThanOrEqual(102);
    expect(peninsulaRunMaxLength(left45, leftRoom)).toBeLessThanOrEqual(102);
  });

  it("anchors a connected return at its parent peninsula endpoint with a locked turn", () => {
    const parent = peninsulaRoom.peninsulaRuns![0];
    const returnRun = {
      id: "peninsula-return",
      parentRunId: parent.id,
      startOffset: 0,
      turn: 90 as const,
      direction: "right" as const,
      length: 42,
      height: 34.5,
      label: "Peninsula return",
    };
    const connectedRoom: RoomData = { ...peninsulaRoom, peninsulaRuns: [parent, returnRun] };
    expect(peninsulaRunEndpoints(returnRun, connectedRoom)).toMatchObject({
      start: { x: 48, y: 96 },
      end: { x: 6, y: 96 },
    });
    expect(wallPlacementAt(0, 30, 24, returnRun.id as any, connectedRoom)).toMatchObject({
      wallId: returnRun.id,
      wallOffset: 0,
      rotation: 180,
    });
    expect(wallPlacementAt(0, 30, 24, returnRun.id as any, connectedRoom, "right")).toMatchObject({
      wallId: returnRun.id,
      peninsulaSide: "right",
      rotation: 0,
    });
    expect(peninsulaRunHitAtPoint(connectedRoom, { x: 20, y: 96 }, 8)).toMatchObject({ run: { id: returnRun.id } });
  });

  it("keeps a straight primary peninsula and its optional 45-degree end on one connected cabinet and countertop path", () => {
    const primary = {
      id: "wizard-straight-primary",
      parentWall: "top" as const,
      startOffset: 48,
      turn: 90 as const,
      direction: "right" as const,
      length: 72,
      height: 34.5,
      cabinetSide: "left" as const,
      countertopSeatingOverhang: 12 as const,
      label: "Peninsula · straight",
    };
    const angledEnd = {
      id: "wizard-angled-end",
      parentRunId: primary.id,
      startOffset: 0,
      turn: 45 as const,
      direction: "right" as const,
      length: 36,
      height: 34.5,
      cabinetSide: "left" as const,
      countertopSeatingOverhang: 12 as const,
      label: "Peninsula end · 45° right",
    };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [primary, angledEnd] };
    expect(peninsulaRunEndpoints(primary, room)).toMatchObject({
      start: { x: 48, y: 0 },
      end: { x: 48, y: 72 },
    });
    expect(peninsulaRunEndpoints(angledEnd, room)).toMatchObject({
      start: { x: 48, y: 72 },
      end: { x: 22.5, y: 97.5 },
    });
    const primarySpot = wallPlacementAt(0, 30, 24, primary.id as any, room, "left");
    const endSpot = wallPlacementAt(0, 24, 24, angledEnd.id as any, room, "left");
    const primaryCabinet = { ...peninsulaCabinet("wizard-primary-cabinet", 0), ...primarySpot, wallId: primary.id, wallOffset: 0 };
    const endCabinet = { ...peninsulaCabinet("wizard-end-cabinet", 0), ...endSpot, wallId: angledEnd.id, wallOffset: 0, width: 24 };
    expect(countertopSurfaces([primaryCabinet, endCabinet], room)).toEqual(expect.arrayContaining([
      expect.objectContaining({ peninsulaRunId: primary.id, linearInches: 72, rotation: 90 }),
      expect.objectContaining({ peninsulaRunId: angledEnd.id, linearInches: 36, rotation: 135 }),
    ]));
  });

  it("treats a legacy direct-45 primary peninsula as a straight first leg instead of a diamond cabinet path", () => {
    const legacyPrimary: PeninsulaRun = {
      id: "legacy-direct-45",
      parentWall: "left",
      startOffset: 48,
      turn: 45,
      direction: "right",
      length: 48,
      height: 34.5,
      label: "Peninsula · 45° right",
    };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [legacyPrimary] };
    expect(peninsulaRunEndpoints(legacyPrimary, room)).toMatchObject({
      start: { x: 0, y: 48 },
      end: { x: 48, y: 48 },
    });
    expect(wallPlacementAt(0, 18, 24, legacyPrimary.id as any, room, "left")).toMatchObject({
      wallId: legacyPrimary.id,
      wallOffset: 0,
      rotation: 0,
    });
    const savedDiamond = {
      ...peninsulaCabinet("legacy-diamond-b18", 0),
      wallId: legacyPrimary.id,
      wallOffset: 0,
      rotation: 45,
      x: 18,
      y: 48,
    };
    const normalized = normalizeLegacyPeninsulaCabinets([savedDiamond], room);
    expect(normalized[0]).toMatchObject({
      wallId: legacyPrimary.id,
      wallOffset: 0,
      rotation: 0,
    });
  });

  it("uses the selected primary-run side rather than a stale cabinet-side value when reseating a legacy cabinet", () => {
    const legacyPrimary: PeninsulaRun = {
      id: "legacy-side-authority",
      parentWall: "left",
      startOffset: 48,
      turn: 45,
      direction: "right",
      length: 48,
      height: 34.5,
      cabinetSide: "left",
    };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [legacyPrimary] };
    const staleRightSide = {
      ...peninsulaCabinet("legacy-right-side-b18", 0),
      wallId: legacyPrimary.id,
      wallOffset: 0,
      peninsulaSide: "right" as const,
      rotation: 45,
    };
    const normalized = normalizeLegacyPeninsulaCabinets([staleRightSide], room);
    expect(normalized[0].peninsulaSide).toBe("left");
    expect(normalized[0]).toMatchObject(wallPlacementAt(0, 18, 24, legacyPrimary.id as any, room, "left"));
  });

  it("reseats a refreshed B-18 with stale connected-run coordinates onto the exact highlighted segment", () => {
    const primary: PeninsulaRun = {
      id: "selected-straight-wall",
      parentWall: "left",
      startOffset: 48,
      turn: 90,
      direction: "right",
      length: 54,
      height: 34.5,
      cabinetSide: "left",
    };
    const nextWall: PeninsulaRun = {
      id: "selected-next-wall",
      parentRunId: primary.id,
      startOffset: 0,
      turn: 45,
      direction: "right",
      length: 60,
      height: 34.5,
      cabinetSide: "right",
    };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [primary, nextWall] };
    const staleB18 = {
      ...peninsulaCabinet("refreshed-b18", 12),
      wallId: nextWall.id,
      wallOffset: 12,
      peninsulaSide: "left" as const,
      rotation: 90,
      x: 36,
      y: 60,
    };
    const normalized = normalizeLegacyPeninsulaCabinets([staleB18], room);
    expect(normalized[0]).toMatchObject({
      ...wallPlacementAt(12, 30, 24, nextWall.id as any, room, "right"),
      wallId: nextWall.id,
      wallOffset: 12,
      peninsulaSide: "right",
    });
  });

  it("keeps a right-side B-18 wholly centered beside a 45-degree wall after its 180-degree face flip", () => {
    const primary: PeninsulaRun = {
      id: "straight-before-angle",
      parentWall: "left",
      startOffset: 48,
      turn: 90,
      direction: "right",
      length: 48,
      height: 34.5,
      cabinetSide: "left",
    };
    const angleWall: PeninsulaRun = {
      id: "right-side-45-wall",
      parentRunId: primary.id,
      startOffset: 0,
      turn: 45,
      direction: "right",
      length: 60,
      height: 34.5,
      cabinetSide: "right",
    };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [primary, angleWall] };
    const spot = wallPlacementAt(12, 18, 24, angleWall.id as any, room, "right");
    const cabinet: PlacedCabinet = {
      ...peninsulaCabinet("right-side-b18", 12),
      ...spot,
      width: 18,
      nominalWidth: 18,
      depth: 24,
      nominalDepth: 24,
      wallId: angleWall.id,
      wallOffset: 12,
      peninsulaSide: "right",
    };
    const footprint = placedFootprint(cabinet);
    const { start, radians } = peninsulaRunEndpoints(angleWall, room);
    const tangent = { x: Math.cos(radians), y: Math.sin(radians) };
    const rightNormal = { x: Math.sin(radians), y: -Math.cos(radians) };
    const expectedCenter = {
      x: start.x + tangent.x * 21 + rightNormal.x * 12,
      y: start.y + tangent.y * 21 + rightNormal.y * 12,
    };
    expect(spot.rotation).toBe(225);
    expect(footprint.w).toBeCloseTo(42 * Math.SQRT1_2, 6);
    expect(footprint.d).toBeCloseTo(42 * Math.SQRT1_2, 6);
    expect(spot.x + footprint.w / 2).toBeCloseTo(expectedCenter.x, 6);
    expect(spot.y + footprint.d / 2).toBeCloseTo(expectedCenter.y, 6);
  });

  it("keeps the nominal cabinet back edge exactly flush to straight and 45-degree peninsula wall lines on either selected side", () => {
    const primary = { ...peninsulaRoom.peninsulaRuns![0], id: "flush-primary", length: 72 };
    const child: PeninsulaRun = {
      id: "flush-angle",
      parentRunId: primary.id,
      startOffset: 0,
      turn: 45,
      direction: "right",
      length: 60,
      height: 34.5,
      cabinetSide: "right",
    };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [primary, child] };
    for (const run of [primary, child]) {
      for (const side of ["left", "right"] as const) {
        const spot = wallPlacementAt(12, 18, 24, run.id as any, room, side);
        const footprint = placedFootprint({
          uid: `${run.id}-${side}`,
          cabinetId: 18,
          masterCode: "B-18",
          description: "Back-edge probe",
          placement: "base",
          ...spot,
          width: 18,
          depth: 24,
          height: 34.5,
        } as PlacedCabinet);
        const geometry = peninsulaRunEndpoints(run, room);
        const tangent = { x: Math.cos(geometry.radians), y: Math.sin(geometry.radians) };
        const leftNormal = { x: -Math.sin(geometry.radians), y: Math.cos(geometry.radians) };
        const faceNormal = side === "left" ? leftNormal : { x: -leftNormal.x, y: -leftNormal.y };
        const center = { x: spot.x + footprint.w / 2, y: spot.y + footprint.d / 2 };
        const backEdgeCenter = { x: center.x - faceNormal.x * 12, y: center.y - faceNormal.y * 12 };
        const wallPoint = { x: geometry.start.x + tangent.x * 21, y: geometry.start.y + tangent.y * 21 };
        expect(backEdgeCenter.x).toBeCloseTo(wallPoint.x, 6);
        expect(backEdgeCenter.y).toBeCloseTo(wallPoint.y, 6);
      }
    }
  });

  it("keeps an exact-width Wizard filler inside its measured peninsula void instead of searching another run location", () => {
    const run = peninsulaRoom.peninsulaRuns![0];
    const spot = firstCollisionFreePeninsulaPlacement(
      run.id as any,
      peninsulaRoom,
      [],
      30,
      24,
      "base",
      { start: 12, end: 12 },
    );
    expect(spot).toMatchObject({ wallId: run.id, wallOffset: 12 });
  });

  it("keeps 11 inches only on the 45-degree leg while the primary 90-degree run remains flush", () => {
    const primary = peninsulaRoom.peninsulaRuns![0];
    const child: PeninsulaRun = {
      id: "peninsula-next-wall",
      parentRunId: primary.id,
      startOffset: 0,
      turn: 45,
      direction: "right",
      length: 48,
      height: 34.5,
      cabinetSide: "left",
    };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [primary, child] };
    expect(firstCollisionFreePeninsulaPlacement(primary.id as any, room, [], 18, 24, "base")).toMatchObject({
      wallId: primary.id,
      wallOffset: 0,
    });
    expect(firstCollisionFreePeninsulaPlacement(child.id as any, room, [], 18, 24, "base")).toMatchObject({
      wallId: child.id,
      wallOffset: 11,
    });
    expect(freeSegmentsOnWall(primary.id as any, room, [], [], 1, 0, "base")).toEqual([
      { start: 0, length: primary.length - 11 },
    ]);
    expect(freeSegmentsOnWall(child.id as any, room, [], [], 1, 0, "base")).toEqual([
      { start: 11, length: child.length - 11 },
    ]);
    expect(PENINSULA_INSIDE_CORNER_CLEARANCE_IN).toBe(11);
  });

  it("auto-snaps a nearby cabinet flush to its straight peninsula wall with exact run ownership", () => {
    const run = peninsulaRoom.peninsulaRuns![0];
    const exact = wallPlacementAt(24, 12, 24, run.id as any, peninsulaRoom);
    const nearby: PlacedCabinet = {
      ...peninsulaCabinet("near-straight-wall", 24),
      masterCode: "B-12",
      width: 12,
      x: exact.x - 4,
      y: exact.y,
      wallId: undefined,
      wallOffset: undefined,
    };
    expect(autoSnapCabinetToNearbyWall(nearby, peninsulaRoom, [], [])).toMatchObject({
      x: exact.x,
      y: exact.y,
      rotation: exact.rotation,
      wallId: run.id,
      wallOffset: 24,
    });
    expect(autoSnapCabinetToNearbyWall({ ...nearby, x: exact.x - 7 }, peninsulaRoom, [], [])).toBeNull();
  });

  it("auto-snaps a nearby cabinet flush to a selected-side 45-degree peninsula wall", () => {
    const primary = { ...peninsulaRoom.peninsulaRuns![0], id: "auto-snap-primary", length: 72 };
    const child: PeninsulaRun = {
      id: "auto-snap-45",
      parentRunId: primary.id,
      startOffset: 0,
      turn: 45,
      direction: "right",
      length: 72,
      height: 34.5,
      cabinetSide: "right",
    };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [primary, child] };
    const exact = wallPlacementAt(24, 12, 24, child.id as any, room, "right");
    const shift = 4 * Math.SQRT1_2;
    const nearby: PlacedCabinet = {
      ...peninsulaCabinet("near-45-wall", 24),
      masterCode: "B-12",
      width: 12,
      x: exact.x + shift,
      y: exact.y + shift,
      rotation: exact.rotation,
      wallId: undefined,
      wallOffset: undefined,
      peninsulaSide: undefined,
    };
    expect(autoSnapCabinetToNearbyWall(nearby, room, [], [])).toMatchObject({
      x: exact.x,
      y: exact.y,
      rotation: 315,
      wallId: child.id,
      wallOffset: 24,
      peninsulaSide: "right",
    });
  });

  it("does not auto-snap through a door opening or an occupied wall span", () => {
    const room: RoomData = { width: 144, depth: 120, ceilingHeight: 96 };
    const nearby: PlacedCabinet = {
      uid: "near-top-wall",
      cabinetId: 12,
      masterCode: "B-12",
      description: "12 inch base cabinet",
      placement: "base",
      x: 30,
      y: 4,
      width: 12,
      depth: 24,
      height: 34.5,
      rotation: 0,
    };
    const door = { uid: "door", kind: "door", label: "Door", side: "top", offset: 24, width: 36, height: 80, sill: 0 } as const;
    expect(autoSnapCabinetToNearbyWall(nearby, room, [], [door])).toBeNull();
    const occupied = { ...nearby, uid: "occupied", x: 30, y: 0 };
    expect(autoSnapCabinetToNearbyWall(nearby, room, [occupied], [])).toBeNull();
  });

  it("fits a 24-inch cabinet on a 36-inch one-corner segment with one inch remaining, but not between two reserved corners", () => {
    const parent = { ...peninsulaRoom.peninsulaRuns![0], id: "peninsula-parent", length: 48 };
    const oneCorner: PeninsulaRun = {
      id: "peninsula-36-free-end",
      parentRunId: parent.id,
      startOffset: 0,
      turn: 45,
      direction: "right",
      length: 36,
      height: 34.5,
      cabinetSide: "right",
    };
    const oneCornerRoom: RoomData = { ...peninsulaRoom, peninsulaRuns: [parent, oneCorner] };
    expect(freeSegmentsOnWall(oneCorner.id as any, oneCornerRoom, [], [], 1, 0, "base")).toEqual([
      { start: 11, length: 25 },
    ]);
    expect(firstCollisionFreePeninsulaPlacement(oneCorner.id as any, oneCornerRoom, [], 24, 24, "base")).toMatchObject({
      wallId: oneCorner.id,
      wallOffset: 11,
    });

    const turnAfter36: PeninsulaRun = {
      id: "peninsula-after-36",
      parentRunId: oneCorner.id,
      startOffset: 0,
      turn: 45,
      direction: "left",
      length: 48,
      height: 34.5,
      cabinetSide: "right",
    };
    const twoCornerRoom: RoomData = { ...peninsulaRoom, peninsulaRuns: [parent, oneCorner, turnAfter36] };
    expect(freeSegmentsOnWall(oneCorner.id as any, twoCornerRoom, [], [], 1, 0, "base")).toEqual([
      { start: 11, length: 14 },
    ]);
    expect(firstCollisionFreePeninsulaPlacement(oneCorner.id as any, twoCornerRoom, [], 24, 24, "base")).toBeNull();
    expect(firstCollisionFreePeninsulaPlacement(oneCorner.id as any, twoCornerRoom, [], 12, 24, "base")).toMatchObject({
      wallId: oneCorner.id,
      wallOffset: 11,
    });
  });

  it("does not move a selected peninsula cabinet onto another connected segment when its selected run lacks 11-inch clearance", () => {
    const primary = { ...peninsulaRoom.peninsulaRuns![0], length: 24 };
    const child: PeninsulaRun = {
      id: "long-adjoining-run",
      parentRunId: primary.id,
      startOffset: 0,
      turn: 45,
      direction: "right",
      length: 72,
      height: 34.5,
    };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [primary, child] };
    expect(firstCollisionFreePeninsulaPlacement(primary.id as any, room, [], 18, 24, "base")).toBeNull();
    expect(firstCollisionFreePeninsulaPlacement(child.id as any, room, [], 18, 24, "base")).toMatchObject({
      wallId: child.id,
      wallOffset: 11,
    });
  });

  it("projects a catalog drop onto the active peninsula run rather than an outside room wall", () => {
    const run = peninsulaRoom.peninsulaRuns![0];
    expect(peninsulaRunOffsetAtPoint(run, peninsulaRoom, { x: 48, y: 63 })).toBe(63);
    expect(peninsulaRunOffsetAtPoint(run, peninsulaRoom, { x: 48, y: 220 })).toBe(96);
  });

  it("recovers unambiguous legacy peninsula ownership before measuring the next edge-to-edge opening", () => {
    const legacy = { ...peninsulaCabinet("legacy-ber33", 30), wallId: undefined, wallOffset: undefined };
    const normalized = normalizeLegacyPeninsulaCabinets([legacy], peninsulaRoom);
    expect(normalized[0]).toMatchObject({ wallId: "peninsula-90-right", wallOffset: 30, peninsulaSide: "left", rotation: 90 });
    const next = wallPlacementAt(0, 30, 24, "peninsula-90-right" as any, peninsulaRoom);
    const candidate = { ...peninsulaCabinet("new-b12", 0), ...next, wallId: next.wallId, wallOffset: next.wallOffset };
    expect(cabinetCollisionDetail(candidate, normalized)).toBeNull();
    expect(freeSegmentsOnWall("peninsula-90-right" as any, peninsulaRoom, normalized, [], 0.5, 0, "base")).toContainEqual({ start: 0, length: 30 });
  });

  it("keeps the 11-inch installer clearance only for a connected 45-degree inside corner", () => {
    const primary = { ...peninsulaRoom.peninsulaRuns![0], id: "primary-90", length: 72 };
    const rightAngleChild: PeninsulaRun = {
      id: "right-angle-child",
      parentRunId: primary.id,
      startOffset: 0,
      turn: 90,
      direction: "right",
      length: 48,
      height: 34.5,
    };
    const rightAngleRoom: RoomData = { ...peninsulaRoom, peninsulaRuns: [primary, rightAngleChild] };
    expect(firstCollisionFreePeninsulaPlacement(rightAngleChild.id as any, rightAngleRoom, [], 24, 24, "base")).toMatchObject({
      wallId: rightAngleChild.id,
      wallOffset: 0,
    });

    const diagonalChild = { ...rightAngleChild, id: "diagonal-child", turn: 45 as const };
    const diagonalRoom: RoomData = { ...peninsulaRoom, peninsulaRuns: [primary, diagonalChild] };
    expect(firstCollisionFreePeninsulaPlacement(diagonalChild.id as any, diagonalRoom, [], 24, 24, "base")).toMatchObject({
      wallId: diagonalChild.id,
      wallOffset: PENINSULA_INSIDE_CORNER_CLEARANCE_IN,
    });
  });

  it("recovers a legacy peninsula cabinet that still carries its original parent-wall owner", () => {
    const staleParentWallOwner = { ...peninsulaCabinet("legacy-parent-wall-ber33", 30), wallId: "top", wallOffset: undefined };
    const normalized = normalizeLegacyPeninsulaCabinets([staleParentWallOwner], peninsulaRoom);
    expect(normalized[0]).toMatchObject({ wallId: "peninsula-90-right", wallOffset: 30, peninsulaSide: "left", rotation: 90 });
    const opening = freeSegmentsOnWall("peninsula-90-right" as any, peninsulaRoom, normalized, [], 0.5, 0, "base");
    expect(opening).toContainEqual({ start: 0, length: 30 });
  });

  it("repairs a parent-wall peninsula cabinet whose saved rotation is still the old perimeter-wall rotation", () => {
    const staleRotation = { ...peninsulaCabinet("legacy-stale-rotation-ber33", 30), wallId: "top", wallOffset: undefined, rotation: 0 };
    const normalized = normalizeLegacyPeninsulaCabinets([staleRotation], peninsulaRoom);
    expect(normalized[0]).toMatchObject({ wallId: "peninsula-90-right", wallOffset: 30, peninsulaSide: "left", rotation: 90 });
    const next = wallPlacementAt(0, 30, 24, "peninsula-90-right" as any, peninsulaRoom);
    const candidate = { ...peninsulaCabinet("new-b12-after-stale-ber33", 0), ...next, wallId: next.wallId, wallOffset: next.wallOffset };
    expect(cabinetCollisionDetail(candidate, normalized)).toBeNull();
    expect(paletteActiveWallPlacement("peninsula-90-right" as any, peninsulaRoom, normalized, [], 30, 24, "base")).toMatchObject({
      wallId: "peninsula-90-right",
      wallOffset: 0,
      rotation: 90,
    });
  });

  it("allows 3-DB15 to begin on a 45-degree peninsula beside BER33 when only the L-corner screen box overlaps", () => {
    const fortyFiveRoom: RoomData = {
      ...peninsulaRoom,
      peninsulaRuns: [{
        id: "peninsula-45-join",
        parentWall: "top",
        startOffset: 36,
        turn: 45,
        direction: "left",
        length: 72,
        height: 34.5,
      }],
    };
    const ber33: PlacedCabinet = {
      uid: "ber33-parent-wall",
      cabinetId: 8,
      masterCode: "BER33",
      description: "Easy Reach Corner Base",
      placement: "base",
      x: 0,
      y: 0,
      width: 33,
      depth: 24,
      height: 34.5,
      rotation: 0,
      wallId: "top",
    };
    const drawerBase: PlacedCabinet = {
      uid: "3-db15-peninsula",
      cabinetId: 9,
      masterCode: "3-DB15",
      description: "15 inch 3 Drawer Base",
      placement: "base",
      // The 45° body touches the BER legs at a point, while its axis-aligned
      // screen envelope overlaps the BER's 36-inch bounding square by 12 inches.
      x: 24,
      y: 24,
      width: 15,
      depth: 24,
      height: 34.5,
      rotation: 45,
      wallId: "peninsula-45-join",
      wallOffset: 0,
      peninsulaSide: "left",
    };
    expect(cabinetCollisionDetail(drawerBase, [ber33])).toMatchObject({ cabinet: ber33 });
    expect(cabinetPlacementCollisionDetail(drawerBase, [ber33], fortyFiveRoom)).toBeNull();
    const trulyOverlappingDrawer = { ...drawerBase, x: 20, y: 20 };
    expect(cabinetPlacementCollisionDetail(trulyOverlappingDrawer, [ber33], fortyFiveRoom)).toMatchObject({ cabinet: ber33 });
  });

  it("automatically starts the first 45-degree peninsula cabinet after a parent-wall corner's true body clearance", () => {
    const fortyFiveRoom: RoomData = {
      ...peninsulaRoom,
      peninsulaRuns: [{
        id: "peninsula-45-clearance",
        parentWall: "top",
        startOffset: 36,
        turn: 45,
        direction: "left",
        length: 72,
        height: 34.5,
      }],
    };
    const ber33: PlacedCabinet = {
      uid: "ber33-parent-wall-clearance",
      cabinetId: 8,
      masterCode: "BER33",
      description: "Easy Reach Corner Base",
      placement: "base",
      x: 0,
      y: 0,
      width: 33,
      depth: 24,
      height: 34.5,
      rotation: 0,
      wallId: "top",
    };
    const normalized = normalizeLegacyPeninsulaCabinets([ber33], fortyFiveRoom);
    expect(normalized[0]).toMatchObject({ wallId: "top", rotation: 0 });
    const start = peninsulaAutomaticStartOffset("peninsula-45-clearance" as any, fortyFiveRoom, normalized, 15, 24, "base");
    const spot = paletteActiveWallPlacement("peninsula-45-clearance" as any, fortyFiveRoom, normalized, [], 15, 24, "base");
    expect(start).toBeGreaterThan(0);
    expect(spot).toMatchObject({ wallId: "peninsula-45-clearance", wallOffset: start });
    const candidate = {
      ...ber33,
      uid: "3-db15-after-ber33-clearance",
      cabinetId: 9,
      masterCode: "3-DB15",
      description: "15 inch 3 Drawer Base",
      width: 15,
      ...spot,
    };
    expect(cabinetPlacementCollisionDetail(candidate, normalized, fortyFiveRoom)).toBeNull();
  });

  it("uses the first physically clear peninsula location when a parent-wall B-24 blocks the join", () => {
    const fortyFiveRoom: RoomData = {
      ...peninsulaRoom,
      peninsulaRuns: [{
        id: "peninsula-45-b24-clearance",
        parentWall: "top",
        startOffset: 72,
        turn: 45,
        direction: "right",
        length: 72,
        height: 34.5,
      }],
    };
    const joinSpot = wallPlacementAt(0, 24, 24, "peninsula-45-b24-clearance" as any, fortyFiveRoom);
    const b24: PlacedCabinet = {
      uid: "b24-parent-wall-join",
      cabinetId: 10,
      masterCode: "B-24",
      description: "24 inch Base Cabinet",
      placement: "base",
      x: joinSpot.x,
      y: joinSpot.y,
      width: 24,
      depth: 24,
      height: 34.5,
      rotation: joinSpot.rotation,
      wallId: "top",
    };
    const firstClear = firstCollisionFreePeninsulaPlacement("peninsula-45-b24-clearance" as any, fortyFiveRoom, [b24], 15, 24, "base");
    const oneClick = paletteActiveWallPlacement("peninsula-45-b24-clearance" as any, fortyFiveRoom, [b24], [], 15, 24, "base");
    expect(firstClear).toMatchObject({ wallId: "peninsula-45-b24-clearance" });
    expect(firstClear!.wallOffset).toBeGreaterThan(0);
    expect(oneClick).toEqual(firstClear);
    const candidate: PlacedCabinet = {
      ...b24,
      uid: "3-db15-after-b24",
      cabinetId: 11,
      masterCode: "3-DB15",
      description: "15 inch 3 Drawer Base",
      width: 15,
      ...firstClear!,
    };
    expect(cabinetPlacementCollisionDetail(candidate, [b24], fortyFiveRoom)).toBeNull();
  });

  it("uses the visible peninsula line as the direct drop target and never reseats an owned upper on an outer wall", () => {
    const hit = peninsulaRunHitAtPoint(peninsulaRoom, { x: 49, y: 60 }, 12);
    expect(hit).toMatchObject({ run: { id: "peninsula-90-right" }, offset: 60 });
    const spot = wallPlacementAt(hit!.offset, 30, 12, hit!.run.id as any, peninsulaRoom);
    const upper: PlacedCabinet = {
      uid: "peninsula-upper",
      cabinetId: 3,
      masterCode: "W-30-30",
      description: "Peninsula upper",
      placement: "wall",
      x: spot.x,
      y: spot.y,
      width: 30,
      depth: 12,
      height: 30,
      rotation: spot.rotation,
      wallId: spot.wallId,
      wallOffset: spot.wallOffset,
    };
    expect(snapWallCabinetToOwningWall(upper, peninsulaRoom)).toEqual(upper);
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
      expect.objectContaining({ kind: "base", rotation: 90, peninsulaRunId: "peninsula-90-right", linearInches: 96 }),
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

  it("bridges a supported peninsula void and extends the selected cabinet face for seating", () => {
    const start = peninsulaCabinet("peninsula-start", 0);
    const end = peninsulaCabinet("peninsula-end", 66);
    const withSeating: RoomData = {
      ...peninsulaRoom,
      peninsulaRuns: [{ ...peninsulaRoom.peninsulaRuns![0], countertopSeatingOverhang: 12, countertopWaterfallEnd: true }],
    };
    const surface = countertopSurfaces([start, end], withSeating).find((item) => item.peninsulaRunId === "peninsula-90-right");
    expect(surface).toMatchObject({ linearInches: 96, areaInches: 96 * 37.5, rotation: 90 });
    expect(surface).toEqual(peninsulaCountertopSurface(withSeating.peninsulaRuns![0], withSeating));
    expect(surface).toMatchObject({ width: 96, depth: 37.5 });
    const placement = wallPlacementAt(0, 96, 37.5, "peninsula-90-right" as any, withSeating, "left");
    const expectedCenter = { x: placement.x + 37.5 / 2, y: placement.y + 96 / 2 };
    expect(surface!.x + surface!.width / 2).toBeCloseTo(expectedCenter.x, 6);
    expect(surface!.y + surface!.depth / 2).toBeCloseTo(expectedCenter.y, 6);
    expect(countertopSurfaces([], withSeating)).toEqual([]);
  });

  it("inherits the root seating overhang across a legacy zero-overhang 45-degree return so the saved B24 corner remains covered", () => {
    const parent = {
      id: "peninsula_mu3bq5rw",
      parentWall: "top" as const,
      startOffset: 144.875,
      turn: 90 as const,
      direction: "left" as const,
      length: 90,
      height: 34.5,
      cabinetSide: "left" as const,
      countertopSeatingOverhang: 12 as const,
      countertopWaterfallEnd: true,
    };
    const child = {
      id: "peninsula_return_mu3bvzwj",
      parentRunId: parent.id,
      startOffset: 0,
      turn: 45 as const,
      direction: "right" as const,
      length: 36,
      height: 34.5,
      cabinetSide: "left" as const,
      countertopSeatingOverhang: 0 as const,
    };
    const room: RoomData = { width: 192, depth: 144, ceilingHeight: 96, peninsulaRuns: [parent, child] };
    const parentB15 = { ...peninsulaCabinet("saved-b15", 36), ...wallPlacementAt(36, 15, 24, parent.id as any, room, "left"), width: 15, wallId: parent.id, wallOffset: 36, peninsulaSide: "left" as const };
    const parentB27 = { ...peninsulaCabinet("saved-b27", 51), ...wallPlacementAt(51, 27, 24, parent.id as any, room, "left"), width: 27, wallId: parent.id, wallOffset: 51, peninsulaSide: "left" as const };
    const childB24 = { ...peninsulaCabinet("saved-b24", 12), ...wallPlacementAt(12, 24, 24, child.id as any, room, "left"), width: 24, wallId: child.id, wallOffset: 12, peninsulaSide: "left" as const };

    expect(peninsulaCountertopSeatingOverhang(parent, room)).toBe(12);
    expect(peninsulaCountertopSeatingOverhang(child, room)).toBe(12);
    expect(peninsulaCountertopWaterfallEnd(parent, room)).toBe(false);
    expect(peninsulaCountertopWaterfallEnd(child, room)).toBe(true);
    const surfaces = countertopSurfaces([parentB15, parentB27, childB24], room).filter((surface) => surface.peninsulaRunId);
    const parentSurface = surfaces.find((surface) => surface.peninsulaRunId === parent.id)!;
    const childSurface = surfaces.find((surface) => surface.peninsulaRunId === child.id)!;
    expect(parentSurface).toMatchObject({ depth: 37.5, miteredEnd: true });
    expect(childSurface).toMatchObject({ depth: 37.5, miteredStart: true });
    const parentPolygon = countertopSurfacePlanPolygon(parentSurface);
    const childPolygon = countertopSurfacePlanPolygon(childSurface);
    const sharedOuterPoint = parentPolygon.find((point) => childPolygon.some((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < 0.001));
    expect(sharedOuterPoint).toBeDefined();
    const visibleArea = surfaces.reduce((sum, surface) => sum + (surface.areaInches ?? surface.width * surface.depth), 0);
    const terminalWaterfallArea = STD.BASE_HEIGHT * childSurface.depth;
    expect(countertopArea([parentB15, parentB27, childB24], null, null, room).squareFeet).toBe(Math.ceil(((visibleArea + terminalWaterfallArea) / 144) * 10) / 10);
  });

  it("gives each cabinet-supported connected run its own continuous countertop without inventing one for an empty return", () => {
    const parent = peninsulaRoom.peninsulaRuns![0];
    const child = { id: "return-with-counter", parentRunId: parent.id, startOffset: 0, turn: 90 as const, direction: "right" as const, length: 42, height: 34.5 };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [parent, child] };
    const parentSpot = wallPlacementAt(66, 30, 24, parent.id as any, room);
    const childSpot = wallPlacementAt(0, 30, 24, child.id as any, room);
    const parentCabinet = { ...peninsulaCabinet("parent-joint", 66), ...parentSpot, wallOffset: 66, wallId: parent.id };
    const childCabinet = { ...peninsulaCabinet("child-joint", 0), ...childSpot, wallOffset: 0, wallId: child.id };
    expect(countertopSurfaces([parentCabinet], room)).toEqual([expect.objectContaining({ peninsulaRunId: parent.id })]);
    expect(countertopSurfaces([parentCabinet, childCabinet], room)).toEqual(expect.arrayContaining([
      expect.objectContaining({ peninsulaRunId: parent.id }),
      expect.objectContaining({ peninsulaRunId: child.id }),
    ]));
  });

  it("retains continuous countertop coverage on a straight peninsula with a locked 45-degree end", () => {
    const parent = { ...peninsulaRoom.peninsulaRuns![0], id: "angled-parent", startOffset: 72, length: 36 };
    const child = { id: "angled-return", parentRunId: parent.id, startOffset: 0, turn: 45 as const, direction: "left" as const, length: 30, height: 34.5 };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [parent, child] };
    const parentSpot = wallPlacementAt(6, 30, 24, parent.id as any, room);
    const childSpot = wallPlacementAt(0, 30, 24, child.id as any, room);
    const parentCabinet = { ...peninsulaCabinet("angled-parent-joint", 6), ...parentSpot, wallOffset: 6, wallId: parent.id };
    const childCabinet = { ...peninsulaCabinet("angled-child-joint", 0), ...childSpot, wallOffset: 0, wallId: child.id };
    expect(countertopSurfaces([parentCabinet, childCabinet], room)).toEqual(expect.arrayContaining([
      expect.objectContaining({ peninsulaRunId: parent.id, linearInches: 36, rotation: 90 }),
      expect.objectContaining({ peninsulaRunId: child.id, linearInches: 30, rotation: 45 }),
    ]));
  });

  it("partitions the straight-to-45 countertop overlap along one shared miter seam and charges only the visible area", () => {
    const parent = { ...peninsulaRoom.peninsulaRuns![0], id: "miter-parent", startOffset: 72, length: 48, cabinetSide: "right" as const };
    const child = { id: "miter-child", parentRunId: parent.id, startOffset: 0, turn: 45 as const, direction: "left" as const, length: 36, height: 34.5, cabinetSide: "right" as const };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [parent, child] };
    const parentSpot = wallPlacementAt(0, 48, 24, parent.id as any, room, "right");
    const childSpot = wallPlacementAt(0, 36, 24, child.id as any, room, "right");
    const parentCabinet = { ...peninsulaCabinet("miter-parent-cabinet", 0), ...parentSpot, width: 48, wallId: parent.id, wallOffset: 0, peninsulaSide: "right" as const };
    const childCabinet = { ...peninsulaCabinet("miter-child-cabinet", 0), ...childSpot, width: 36, wallId: child.id, wallOffset: 0, peninsulaSide: "right" as const };
    const surfaces = countertopSurfaces([parentCabinet, childCabinet], room);
    const parentSurface = surfaces.find((surface) => surface.peninsulaRunId === parent.id)!;
    const childSurface = surfaces.find((surface) => surface.peninsulaRunId === child.id)!;
    expect(parentSurface.polygon).toBeDefined();
    expect(childSurface.polygon).toBeDefined();
    expect(parentSurface.areaInches).toBeLessThan(parent.length * parentSurface.depth);
    expect(childSurface.areaInches).toBeLessThan(child.length * childSurface.depth);

    const parentGeometry = peninsulaRunEndpoints(parent, room);
    const childGeometry = peninsulaRunEndpoints(child, room);
    const lineNormal = {
      x: Math.cos(parentGeometry.radians) + Math.cos(childGeometry.radians),
      y: Math.sin(parentGeometry.radians) + Math.sin(childGeometry.radians),
    };
    const magnitude = Math.hypot(lineNormal.x, lineNormal.y);
    lineNormal.x /= magnitude;
    lineNormal.y /= magnitude;
    const seamPoints = (surface: typeof parentSurface) => countertopSurfacePlanPolygon(surface)
      .filter((point) => Math.abs((point.x - parentGeometry.end.x) * lineNormal.x + (point.y - parentGeometry.end.y) * lineNormal.y) < 0.001)
      .sort((a, b) => a.x - b.x || a.y - b.y);
    const parentSeam = seamPoints(parentSurface);
    const childSeam = seamPoints(childSurface);
    expect(parentSeam).toHaveLength(2);
    expect(childSeam).toHaveLength(2);
    expect(parentSeam[0]).toEqual(expect.objectContaining({ x: expect.closeTo(childSeam[0]!.x, 5), y: expect.closeTo(childSeam[0]!.y, 5) }));
    expect(parentSeam[1]).toEqual(expect.objectContaining({ x: expect.closeTo(childSeam[1]!.x, 5), y: expect.closeTo(childSeam[1]!.y, 5) }));

    const visibleArea = surfaces.reduce((sum, surface) => sum + (surface.areaInches ?? surface.width * surface.depth), 0);
    const measurement = countertopArea([parentCabinet, childCabinet], null, null, room);
    expect(measurement.squareFeet).toBe(Math.ceil((visibleArea / 144) * 10) / 10);
  });

  it.each([
    ["right", "right", "left"],
    ["right", "left", "right"],
    ["left", "right", "left"],
    ["left", "left", "right"],
  ] as const)("keeps the %s-side %s/%s straight-to-45-to-straight countertop within its physical depth", (cabinetSide, firstDirection, secondDirection) => {
    const primary = { id: `projection-${cabinetSide}-${firstDirection}-primary`, parentWall: "left" as const, startOffset: 48, turn: 90 as const, direction: "right" as const, length: 30, height: 34.5, cabinetSide };
    const angle = { id: `projection-${cabinetSide}-${firstDirection}-angle`, parentRunId: primary.id, startOffset: 0, turn: 45 as const, direction: firstDirection, length: 42, height: 34.5, cabinetSide };
    const returning = { id: `projection-${cabinetSide}-${firstDirection}-return`, parentRunId: angle.id, startOffset: 0, turn: 45 as const, direction: secondDirection, length: 48, height: 34.5, cabinetSide };
    const room: RoomData = { ...peninsulaRoom, width: 180, depth: 150, peninsulaRuns: [primary, angle, returning] };
    const cabinets = room.peninsulaRuns!.map((run, index) => {
      const spot = wallPlacementAt(0, run.length, 24, run.id as any, room, cabinetSide);
      return { ...peninsulaCabinet(`${run.id}-cabinet`, 0), ...spot, cabinetId: index + 1, width: run.length, wallId: run.id, wallOffset: 0, peninsulaSide: cabinetSide };
    });
    const surfaces = countertopSurfaces(cabinets, room).filter((surface) => surface.peninsulaRunId);
    expect(surfaces).toHaveLength(3);
    for (const surface of surfaces) {
      const run = room.peninsulaRuns!.find((candidate) => candidate.id === surface.peninsulaRunId)!;
      const geometry = peninsulaRunEndpoints(run, room);
      const leftNormal = { x: -Math.sin(geometry.radians), y: Math.cos(geometry.radians) };
      const normal = cabinetSide === "left" ? leftNormal : { x: -leftNormal.x, y: -leftNormal.y };
      const outwardDistances = countertopSurfacePlanPolygon(surface).map((point) =>
        (point.x - geometry.start.x) * normal.x + (point.y - geometry.start.y) * normal.y,
      );
      expect(Math.min(...outwardDistances)).toBeGreaterThanOrEqual(-0.001);
      expect(Math.max(...outwardDistances)).toBeLessThanOrEqual(surface.depth + 0.001);
    }
    const [primarySurface, angleSurface, returnSurface] = surfaces;
    expect(primarySurface).toEqual(expect.objectContaining({ miteredEnd: true }));
    expect(angleSurface).toEqual(expect.objectContaining({ miteredStart: true, miteredEnd: true }));
    expect(returnSurface).toEqual(expect.objectContaining({ miteredStart: true }));
  });

  it("cuts the peninsula countertop around a stove without changing the connected 45-degree return", () => {
    const parent = { ...peninsulaRoom.peninsulaRuns![0], id: "stove-parent", startOffset: 72, length: 96 };
    const child = { id: "stove-angled-return", parentRunId: parent.id, startOffset: 0, turn: 45 as const, direction: "left" as const, length: 30, height: 34.5 };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [parent, child] };
    const startSpot = wallPlacementAt(0, 24, 24, parent.id as any, room);
    const stoveSpot = wallPlacementAt(24, 30, 25, parent.id as any, room);
    const endSpot = wallPlacementAt(54, 42, 24, parent.id as any, room);
    const angledSpot = wallPlacementAt(0, 30, 24, child.id as any, room);
    const start = { ...peninsulaCabinet("stove-start", 0), ...startSpot, width: 24, wallId: parent.id, wallOffset: 0 };
    const stove = {
      ...peninsulaCabinet("range-opening", 24),
      ...stoveSpot,
      masterCode: "STOVE-30",
      description: "30 inch gas stove",
      placement: "appliance" as const,
      width: 30,
      depth: 25,
      height: 36,
      wallId: parent.id,
      wallOffset: 24,
    };
    const end = { ...peninsulaCabinet("stove-end", 54), ...endSpot, width: 42, wallId: parent.id, wallOffset: 54 };
    const angled = { ...peninsulaCabinet("stove-angle", 0), ...angledSpot, width: 30, wallId: child.id, wallOffset: 0 };

    const surfaces = countertopSurfaces([start, stove, end, angled], room);
    const parentSurfaces = surfaces.filter((surface) => surface.peninsulaRunId === parent.id);
    expect(parentSurfaces).toEqual([
      expect.objectContaining({ runStartIn: 0, linearInches: 24, rotation: 90 }),
      expect.objectContaining({ runStartIn: 54, linearInches: 42, rotation: 90 }),
    ]);
    expect(parentSurfaces.reduce((total, surface) => total + (surface.linearInches ?? 0), 0)).toBe(66);
    expect(surfaces).toContainEqual(expect.objectContaining({ peninsulaRunId: child.id, runStartIn: 0, linearInches: 30, rotation: 45 }));
  });

  it("deletes only the selected peninsula and its owned cabinets, clearing derived counter, price, and materials entries", () => {
    const owned = peninsulaCabinet("delete-peninsula", 0);
    const removed = removePeninsulaRun(peninsulaRoom, [owned], "peninsula-90-right");
    expect(removed.room.peninsulaRuns).toEqual([]);
    expect(removed.placed).toEqual([]);
    expect(removed.removedCabinetUids).toEqual(["delete-peninsula"]);
    expect(countertopSurfaces(removed.placed, removed.room)).toEqual([]);
    const lines = buildDesignCabinetCartLines({
      placed: removed.placed,
      styleId: 77,
      distributorId: 11,
      tier: "homeowner",
      styleNameById: new Map([[77, "Test finish"]]),
      unitPriceFor: () => 250,
    });
    expect(lines).toEqual([]);
    expect(buildMaterialsListRows({ buildRows: [], pricingLines: lines })).toEqual([]);
  });

  it("removes a selected return and its descendants without touching its parent run", () => {
    const parent = peninsulaRoom.peninsulaRuns![0];
    const child = { id: "return", parentRunId: parent.id, startOffset: 0, turn: 90 as const, direction: "left" as const, length: 24, height: 34.5 };
    const grandchild = { id: "return-two", parentRunId: child.id, startOffset: 0, turn: 90 as const, direction: "right" as const, length: 24, height: 34.5 };
    const room: RoomData = { ...peninsulaRoom, peninsulaRuns: [parent, child, grandchild] };
    const parentCabinet = peninsulaCabinet("parent-cabinet", 0);
    const childCabinet = { ...peninsulaCabinet("return-cabinet", 0), wallId: child.id };
    const grandchildCabinet = { ...peninsulaCabinet("return-two-cabinet", 0), wallId: grandchild.id };
    const removed = removePeninsulaRun(room, [parentCabinet, childCabinet, grandchildCabinet], child.id);
    expect(removed.room.peninsulaRuns).toEqual([parent]);
    expect(removed.placed.map((cabinet) => cabinet.uid)).toEqual(["parent-cabinet"]);
  });
});
