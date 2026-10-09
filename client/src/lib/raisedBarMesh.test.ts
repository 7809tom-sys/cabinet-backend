import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { addThreeDPeninsulaCountertops } from "@/components/design/InteractiveRoom3D";
import { wallPlacementAt, type PlacedCabinet, type RoomData } from "./design";

describe("raised bar real 3D mesh", () => {
  it.each(["left", "right"] as const)("projects outward only on the %s side", (side) => {
    const room: RoomData = { width: 144, depth: 144, peninsulaRuns: [{ id: "main", parentWall: "top", startOffset: 24, direction: "right", length: 72, height: 96, cabinetSide: side, countertopRaisedBar: true, countertopRaisedBarOverhang: 15 }] };
    const placed = [0, 36].map((off, i) => {
      const p = wallPlacementAt(off, 36, 24, "main" as any, room, side);
      return { uid: `b${i}`, cabinetId: 1, masterCode: "B36", description: "b", placement: "base", x: p.x, y: p.y, width: 36, depth: 24, height: 34.5, rotation: p.rotation, wallId: "main", wallOffset: off } as PlacedCabinet;
    });
    const scene = new THREE.Group();
    addThreeDPeninsulaCountertops(scene, room, placed, "#fff");
    scene.updateMatrixWorld(true);
    const box = (raised: boolean) => {
      const mesh = scene.children.find((o) => o.userData.peninsulaRunId && Boolean(o.userData.raisedBar) === raised && (o as THREE.Mesh).isMesh)!;
      const b = new THREE.Box3().setFromObject(mesh);
      return { minX: b.min.x * 12, maxX: b.max.x * 12, minZ: b.min.z * 12, maxZ: b.max.z * 12 };
    };
    const low = box(false), high = box(true);
    expect(high.minZ).toBeCloseTo(low.minZ, 1);
    expect(high.maxZ).toBeCloseTo(low.maxZ, 1);
    if (side === "left") {
      expect(high.maxX).toBeCloseTo(low.maxX, 1);
      expect(high.minX).toBeCloseTo(low.minX - 13.5, 1);
    } else {
      expect(high.minX).toBeCloseTo(low.minX, 1);
      expect(high.maxX).toBeCloseTo(low.maxX + 13.5, 1);
    }
  });
});
