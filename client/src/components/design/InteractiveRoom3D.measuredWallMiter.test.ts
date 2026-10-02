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
  it("renders both seated base slabs with one physical 45-degree seam", () => {
    const diagonalLength = Math.hypot(60, 60);
    const root = new THREE.Group();
    addThreeDMeasuredWallMiterCountertops(root, room, [
      baseCabinet("diagonal-base", "diagonal", diagonalLength - 24),
      baseCabinet("straight-base", "straight", 0),
    ], "#ffffff");

    expect(root.children).toHaveLength(2);
    const miteredSlabs = root.children.filter((child) => (
      (child as THREE.Mesh).userData.measuredWallMiterCountertop === true
    )) as THREE.Mesh[];
    expect(miteredSlabs).toHaveLength(2);
    expect(miteredSlabs[0]?.userData).toMatchObject({
      measuredWallContinuousCountertop: true,
      measuredWallMiterCountertop: true,
      customWallMiterWallIds: ["diagonal", "straight"],
      customWallMiterVertexId: "v2",
      miterAngleDegrees: 45,
      physicalMiterSeam: true,
    });
    expect(miteredSlabs.every((slab) => slab.geometry.type === "ExtrudeGeometry")).toBe(true);
  });

  it("renders a flush square seam where two diagonal measured walls turn 90 degrees", () => {
    const squareRoom = {
      ...DEFAULT_ROOM,
      width: 180,
      depth: 180,
      vertices: [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 60, y: 60 },
        { id: "c", x: 0, y: 120 },
        { id: "d", x: 0, y: 180 },
      ],
      customWalls: [
        { id: "first", startVertexId: "a", endVertexId: "b", lockedAngle: 45 as const },
        { id: "second", startVertexId: "b", endVertexId: "c", lockedAngle: 45 as const },
        { id: "close", startVertexId: "c", endVertexId: "d" },
        { id: "left", startVertexId: "d", endVertexId: "a" },
      ],
    };
    const base = (uid: string, wallId: string, offset: number): PlacedCabinet => {
      const spot = wallPlacementAt(offset, 36, 24, wallId as any, squareRoom);
      return {
        uid,
        cabinetId: 11,
        masterCode: "B-36",
        description: '36" Base Cabinet',
        placement: "base",
        x: spot.x,
        y: spot.y,
        width: 36,
        depth: 24,
        height: 34.5,
        rotation: spot.rotation,
        wallId,
        wallOffset: spot.wallOffset,
        numberOfDoors: 2,
        numberOfDrawers: 1,
      };
    };
    const diagonalLength = Math.hypot(60, 60);
    const root = new THREE.Group();
    addThreeDMeasuredWallMiterCountertops(root, squareRoom, [
      base("first-base", "first", diagonalLength - 36),
      base("second-base", "second", 0),
    ], "#ffffff");

    const slabs = root.children as THREE.Mesh[];
    expect(slabs).toHaveLength(2);
    expect(slabs.every((slab) => slab.userData.measuredWallSquareCornerCountertop === true)).toBe(true);
    expect(slabs.every((slab) => slab.userData.physicalSquareCornerSeam === true)).toBe(true);
    expect(slabs.every((slab) => slab.userData.measuredWallMiterCountertop === false)).toBe(true);
    expect(slabs.every((slab) => slab.geometry.type === "ExtrudeGeometry")).toBe(true);
  });
});
