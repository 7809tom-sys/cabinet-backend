import { describe, expect, it } from "vitest";
import { DEFAULT_ROOM, appendCollisionFreePlacements, cabinetPlacementCollisionDetail, type PlacedCabinet, wallLength, wallPlacementAt } from "@/lib/design";
import { automaticAngledWallFiller } from "./angledWallFiller";

const room = {
  ...DEFAULT_ROOM,
  width: 180,
  depth: 180,
  vertices: [
    { id: "v1", x: 0, y: 0 },
    { id: "v2", x: 60, y: 60 },
    { id: "v3", x: 60, y: 180 },
    { id: "v4", x: 0, y: 180 },
  ],
  customWalls: [
    { id: "diagonal", startVertexId: "v1", endVertexId: "v2", lockedAngle: 45 as const },
    { id: "straight", startVertexId: "v2", endVertexId: "v3" },
    { id: "return", startVertexId: "v3", endVertexId: "v4" },
    { id: "close", startVertexId: "v4", endVertexId: "v1" },
  ],
};

function wallCabinet(uid: string, wallId: string, offset: number, width = 24): PlacedCabinet {
  const spot = wallPlacementAt(offset, width, 12, wallId as any, room);
  return {
    uid,
    cabinetId: 10,
    masterCode: "W-2442",
    description: '24" x 42" Wall Cabinet',
    placement: "wall",
    x: spot.x,
    y: spot.y,
    width,
    depth: 12,
    height: 42,
    rotation: spot.rotation,
    wallId,
    wallOffset: spot.wallOffset,
    numberOfDoors: 2,
    numberOfDrawers: 0,
  };
}

const wallFiller = {
  id: 99,
  masterCode: "WF342",
  description: '3" x 42" Filler',
  category: "Filler",
  subCategory: "Filler",
  width: "3",
  height: "42",
  depth: "12",
  catalogImageUrl: null,
};

describe("automaticAngledWallFiller", () => {
  it("adds a real selected-line filler into the measured 45-degree seam", () => {
    const diagonalLength = wallLength("diagonal" as any, room);
    const neighbor = wallCabinet("neighbor", "diagonal", diagonalLength - 24);
    const newlyPlaced = wallCabinet("new", "straight", 3);

    const resolution = automaticAngledWallFiller(newlyPlaced, room, [neighbor, newlyPlaced], [wallFiller], () => "miter-filler", 7);

    expect(resolution?.gapIn).toBe(3);
    expect(resolution?.miterAt).toBe("start");
    expect(resolution?.filler.masterCode).toBe("WF342");
    expect(resolution?.filler.width).toBe(3);
    expect(resolution?.filler.fillerMiterAngle).toBe(45);
    expect(resolution?.filler.fillerMiteredEnd).toBe("start");
    expect(resolution?.filler.description).toContain('cut to 3"');
    expect(resolution?.filler.description).toContain("45° miter at wall start");
    expect(cabinetPlacementCollisionDetail(resolution!.filler, [neighbor, newlyPlaced], room)).toBeNull();
    const committed = appendCollisionFreePlacements([neighbor, newlyPlaced], [resolution!.filler], room);
    expect(committed.rejected).toEqual([]);
    expect(committed.placed).toHaveLength(3);
    const blockingWallCabinet = wallCabinet("blocking", "straight", 0, 3);
    expect(cabinetPlacementCollisionDetail(resolution!.filler, [blockingWallCabinet], room)).not.toBeNull();
  });

  it("does not fabricate trim for a normal 90-degree wall join", () => {
    const ninetyRoom = {
      ...room,
      customWalls: room.customWalls.map((wall) => wall.id === "diagonal" ? { ...wall, lockedAngle: undefined } : wall),
    };
    const diagonalLength = wallLength("diagonal" as any, ninetyRoom);
    const neighbor = wallCabinet("neighbor", "diagonal", diagonalLength - 24);
    const newlyPlaced = wallCabinet("new", "straight", 3);

    expect(automaticAngledWallFiller(newlyPlaced, ninetyRoom, [neighbor, newlyPlaced], [wallFiller], () => "miter-filler", null)).toBeNull();
  });

  it("does not invent a filler when the selected line lacks a source that covers the seam", () => {
    const diagonalLength = wallLength("diagonal" as any, room);
    const neighbor = wallCabinet("neighbor", "diagonal", diagonalLength - 24);
    const newlyPlaced = wallCabinet("new", "straight", 3);

    expect(automaticAngledWallFiller(newlyPlaced, room, [neighbor, newlyPlaced], [], () => "miter-filler", null)).toBeNull();
  });
});
