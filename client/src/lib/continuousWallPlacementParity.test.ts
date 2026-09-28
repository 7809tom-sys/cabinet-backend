import { describe, expect, it } from "vitest";
import { appendWallBuilderSegment, wallBuilderRoomGeometry, type WallBuilderSegment } from "./polygonRoom";
import {
  containCabinetOnDrawnWalls,
  countertopSurfacePlanPolygon,
  countertopSurfaces,
  customWallCabinetSide,
  paletteActiveWallPlacement,
  wallPlacementAt,
  type PlacedCabinet,
  type RoomData,
} from "./design";

function drawnRoom(turn: "left90" | "right90"): RoomData {
  let segments: WallBuilderSegment[] = [];
  segments = appendWallBuilderSegment(segments, 100, "start");
  segments = appendWallBuilderSegment(segments, 60, turn);
  const result = wallBuilderRoomGeometry(segments);
  if (!result.room) throw new Error(result.error ?? "Expected a measured room path");
  return { ...result.room, ceilingHeight: 96 };
}

function threeDrawerBase(spot: ReturnType<typeof wallPlacementAt>): PlacedCabinet {
  return {
    uid: "3db21",
    cabinetId: 21,
    masterCode: "3DB21",
    description: "21 inch Three Drawer Base",
    placement: "base",
    x: spot.x,
    y: spot.y,
    width: 21,
    depth: 24,
    height: 34.5,
    rotation: spot.rotation,
    wallId: spot.wallId,
    wallOffset: spot.wallOffset,
  };
}

describe("Continuous Wall Builder placement parity", () => {
  it("uses the room's measured turn to keep a 3DB21 inside a counter-clockwise open path", () => {
    const room = drawnRoom("left90");
    const wall = room.customWalls![1]!;

    expect(customWallCabinetSide(room, wall.id)).toBe("right");
    const spot = wallPlacementAt(0, 21, 24, wall.id as never, room);

    // The measured second wall is x=100. Its inside face is west; the cabinet
    // body must end on x=100, never begin there and extend beyond the room.
    expect(spot).toMatchObject({ x: 76, y: 39, rotation: 90, wallId: wall.id, wallOffset: 0 });
  });

  it("uses that same inside face for a direct catalog add on the selected wall", () => {
    const room = drawnRoom("left90");
    const wall = room.customWalls![1]!;

    const spot = paletteActiveWallPlacement(
      wall.id as never,
      room,
      [],
      [],
      21,
      24,
      "base",
    );

    expect(spot).toMatchObject({ x: 76, y: 39, rotation: 90, wallId: wall.id, wallOffset: 0 });
  });

  it("repairs the screenshot's outside-right-wall 3DB21 using the same measured wall engine", () => {
    const room = drawnRoom("left90");
    const wall = room.customWalls![1]!;
    const outside: PlacedCabinet = {
      ...threeDrawerBase(wallPlacementAt(0, 21, 24, wall.id as never, room)),
      // Previous left-normal placement left the body to the east of x=100.
      x: 100,
      y: 39,
      rotation: 90,
      wallId: wall.id,
      wallOffset: 0,
    };

    const repaired = containCabinetOnDrawnWalls(outside, room);
    expect(repaired).toMatchObject({ x: 76, y: 39, rotation: 90, wallId: wall.id, wallOffset: 0 });
    expect(repaired.x + 24).toBe(100);
  });

  it("keeps the 1½-inch custom-wall countertop overhang inside the same measured face", () => {
    const room = drawnRoom("left90");
    const wall = room.customWalls![1]!;
    const cabinet = threeDrawerBase(wallPlacementAt(0, 21, 24, wall.id as never, room));
    const surface = countertopSurfaces([cabinet], room).find((candidate) => candidate.customWallId === wall.id);
    expect(surface).toBeDefined();

    const polygon = countertopSurfacePlanPolygon(surface!);
    expect(Math.max(...polygon.map((point) => point.x))).toBeCloseTo(100, 6);
    expect(Math.min(...polygon.map((point) => point.x))).toBeCloseTo(74.5, 6);
  });

  it("matches the standard Designer's right-wall inside placement for an equivalent clockwise path", () => {
    const room = drawnRoom("right90");
    const wall = room.customWalls![1]!;
    const continuousSpot = wallPlacementAt(0, 21, 24, wall.id as never, room);
    const standardSpot = wallPlacementAt(0, 21, 24, "right", { width: 100, depth: 60 });

    expect(customWallCabinetSide(room, wall.id)).toBe("left");
    expect(continuousSpot).toMatchObject({ x: standardSpot.x, y: standardSpot.y, rotation: standardSpot.rotation });
  });
});
