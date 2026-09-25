import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM,
  countertopSurfaces,
  measuredWallCountertopMiterSurfaces,
  type PlacedCabinet,
  wallPlacementAt,
} from "./design";

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

function baseCabinet(uid: string, wallId: string, offset: number, width = 24): PlacedCabinet {
  const spot = wallPlacementAt(offset, width, 24, wallId as any, room);
  return {
    uid,
    cabinetId: 10,
    masterCode: "B-24",
    description: '24" Base Cabinet',
    placement: "base",
    x: spot.x,
    y: spot.y,
    width,
    depth: 24,
    height: 34.5,
    rotation: spot.rotation,
    wallId,
    wallOffset: spot.wallOffset,
    numberOfDoors: 2,
    numberOfDrawers: 1,
  };
}

describe("measuredWallCountertopMiterSurfaces", () => {
  it("fills only the physical outer gap where countertop-supported runs meet a 45-degree wall", () => {
    const diagonalLength = Math.hypot(60, 60);
    const diagonalBase = baseCabinet("diagonal-base", "diagonal", diagonalLength - 24);
    const straightBase = baseCabinet("straight-base", "straight", 0);

    const bridges = measuredWallCountertopMiterSurfaces([diagonalBase, straightBase], room);
    expect(bridges).toHaveLength(1);
    expect(bridges[0]).toMatchObject({
      customWallMiterWallIds: ["diagonal", "straight"],
      customWallMiterVertexId: "v2",
      miteredStart: true,
      miteredEnd: true,
    });
    expect(bridges[0]?.polygon).toHaveLength(3);
    expect(bridges[0]?.areaInches).toBeGreaterThan(1);

    const surfaces = countertopSurfaces([diagonalBase, straightBase], room);
    expect(surfaces.filter((surface) => surface.customWallMiterVertexId === "v2")).toHaveLength(1);
    expect(surfaces.filter((surface) => surface.rotation === 45 || surface.rotation === 90)).toHaveLength(2);
  });

  it("does not invent a countertop miter at the same join when the explicit 45-degree wall is removed", () => {
    const rightAngleRoom = {
      ...room,
      customWalls: room.customWalls.map((wall) => wall.id === "diagonal" ? { ...wall, lockedAngle: undefined } : wall),
    };
    const diagonalLength = Math.hypot(60, 60);
    const diagonalBase = { ...baseCabinet("diagonal-base", "diagonal", diagonalLength - 24), rotation: 45 };
    const straightBase = baseCabinet("straight-base", "straight", 0);

    expect(measuredWallCountertopMiterSurfaces([diagonalBase, straightBase], rightAngleRoom)).toEqual([]);
  });
});
