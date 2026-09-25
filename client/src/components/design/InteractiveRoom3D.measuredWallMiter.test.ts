import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DEFAULT_ROOM, type PlacedCabinet, wallPlacementAt } from "@/lib/design";
import { addThreeDMeasuredWallMiterCountertops } from "./InteractiveRoom3D";

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

describe("addThreeDMeasuredWallMiterCountertops", () => {
  it("adds one physical 45-degree countertop bridge between seated base runs", () => {
    const diagonalLength = Math.hypot(60, 60);
    const root = new THREE.Group();
    addThreeDMeasuredWallMiterCountertops(root, room, [
      baseCabinet("diagonal-base", "diagonal", diagonalLength - 24),
      baseCabinet("straight-base", "straight", 0),
    ], "#ffffff");

    expect(root.children).toHaveLength(1);
    const bridge = root.children[0] as THREE.Mesh;
    expect(bridge.userData).toMatchObject({
      measuredWallMiterCountertop: true,
      customWallMiterWallIds: ["diagonal", "straight"],
      customWallMiterVertexId: "v2",
      miterAngleDegrees: 45,
      physicalMiterBridge: true,
    });
    expect(bridge.geometry.type).toBe("ExtrudeGeometry");
  });
});
