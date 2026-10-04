import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { addThreeDPeninsulaCountertops } from "@/components/design/InteractiveRoom3D";
import {
  RAISED_BAR_HEIGHT_IN,
  countertopSurfaces,
  type PeninsulaRun,
  type PlacedCabinet,
  type RoomData,
  wallPlacementAt,
} from "./design";
import { islandRaisedBarRects } from "./islandScene";

const room: RoomData = {
  width: 144,
  depth: 144,
  peninsulaRuns: [
    {
      id: "main",
      parentWall: "top",
      startOffset: 24,
      direction: "right",
      length: 72,
      height: 96,
      cabinetSide: "left",
      countertopRaisedBar: true,
      countertopRaisedBarOverhang: 15,
    },
    {
      id: "return-45",
      parentRunId: "main",
      parentWall: "top",
      startOffset: 0,
      direction: "right",
      turn: 45,
      length: 42,
      height: 96,
      cabinetSide: "left",
    },
  ],
};

const root = room.peninsulaRuns![0]!;
const return45 = room.peninsulaRuns![1]!;

function baseOnRun(uid: string, run: PeninsulaRun, offset: number, width: number): PlacedCabinet {
  const position = wallPlacementAt(offset, width, 24, run.id as any, room, run.cabinetSide);
  return {
    uid,
    cabinetId: 1,
    masterCode: "B24",
    description: "24 inch base cabinet",
    placement: "base",
    x: position.x,
    y: position.y,
    width,
    depth: 24,
    height: 34.5,
    rotation: position.rotation,
    wallId: run.id,
    wallOffset: offset,
  };
}

describe("split-level countertop geometry", () => {
  it("keeps the worktop low and builds a separate 42-inch, 15-inch raised bar through a 45-degree return", () => {
    const placed = [
      baseOnRun("main-base", root, 0, 72),
      baseOnRun("return-base", return45, 0, 42),
    ];
    const surfaces = countertopSurfaces(placed, room);
    const raised = surfaces.filter((surface) => surface.raisedBar);
    const worktops = surfaces.filter((surface) => surface.peninsulaRunId && !surface.raisedBar);

    // The lower worktop may be fabricated as one unified 45-degree surface;
    // the upper bar deliberately remains separately mitered at its own height.
    expect(worktops.length).toBeGreaterThanOrEqual(1);
    expect(raised).toHaveLength(2);
    expect(raised).toEqual(expect.arrayContaining([
      expect.objectContaining({ peninsulaRunId: "main", countertopHeightIn: RAISED_BAR_HEIGHT_IN, raisedBarOverhangIn: 15, depth: 19.5 }),
      expect.objectContaining({ peninsulaRunId: "return-45", countertopHeightIn: RAISED_BAR_HEIGHT_IN, raisedBarOverhangIn: 15, depth: 19.5 }),
    ]));
    expect(raised.every((surface) => surface.miteredStart || surface.miteredEnd)).toBe(true);
  });

  it("keeps a raised island bar as a separate 15-inch seating projection", () => {
    const island = { x: 36, y: 42, width: 72, depth: 48, activeFace: "front" as const, raisedBar: true, raisedBarSide: "back" as const, raisedBarOverhang: 15 as const };
    const placed: PlacedCabinet[] = [{
      uid: "island-base",
      cabinetId: 1,
      masterCode: "B36",
      description: "36 inch base cabinet",
      placement: "base",
      islandFace: "front",
      x: 54,
      y: 66,
      width: 36,
      depth: 24,
      height: 34.5,
      rotation: 0,
    }];
    const bars = islandRaisedBarRects(island, placed);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ width: 39, depth: 19.5 });
    expect(bars[0]!.y).toBeLessThan(placed[0]!.y);
  });

  it("renders each 45-degree raised-bar segment at 42 inches, separate from the 36-inch worktop", () => {
    const placed = [baseOnRun("mesh-main", root, 0, 72), baseOnRun("mesh-return", return45, 0, 42)];
    const scene = new THREE.Group();
    addThreeDPeninsulaCountertops(scene, room, placed, "#ffffff");
    const raised: THREE.Object3D[] = [];
    const worktops: THREE.Object3D[] = [];
    scene.traverse((node) => {
      if (node.userData.raisedBar) raised.push(node);
      if (node.userData.peninsulaCountertop && !node.userData.raisedBar) worktops.push(node);
    });
    expect(raised).toHaveLength(2);
    expect(worktops.length).toBeGreaterThan(0);
    expect(raised.every((node) => node.userData.countertopHeightIn === 42 && node.userData.raisedBarOverhangIn === 15)).toBe(true);
    expect(worktops.every((node) => node.userData.countertopHeightIn === 36)).toBe(true);
  });
});
