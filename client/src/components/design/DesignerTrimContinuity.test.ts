import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mergedElevationTrimRuns } from "./ElevationView";
import { addCabinet, addThreeDCrownMolding } from "./InteractiveRoom3D";

describe("continuous cabinet trim", () => {
  it("merges edge-touching crown and toe-kick intervals but preserves true openings", () => {
    expect(mergedElevationTrimRuns([
      { start: 0, end: 24, level: 96, uid: "a" },
      { start: 24, end: 54, level: 96, uid: "b" },
      { start: 60, end: 84, level: 96, uid: "c" },
    ])).toEqual([
      { start: 0, end: 54, level: 96, anchorUid: "a" },
      { start: 60, end: 84, level: 96, anchorUid: "c" },
    ]);
  });

  it("keeps separately elevated upper runs separate", () => {
    expect(mergedElevationTrimRuns([
      { start: 0, end: 24, level: 96, uid: "a" },
      { start: 24, end: 48, level: 84, uid: "b" },
    ])).toHaveLength(2);
  });

  it("adds crown to every wall cabinet with overlapping front rails and exposed-edge returns", () => {
    const root = new THREE.Group();
    addThreeDCrownMolding(root, [
      { uid: "w24", cabinetId: 1, masterCode: "W-24-42", description: "Wall", placement: "wall", x: 0, y: 0, width: 24, height: 42, depth: 12, rotation: 0, mountBottom: 54 },
      { uid: "w30", cabinetId: 2, masterCode: "W-30-42", description: "Wall", placement: "wall", x: 24, y: 0, width: 30, height: 42, depth: 12, rotation: 0, mountBottom: 54 },
    ], { width: 120, depth: 96, ceilingHeight: 96 }, undefined, "#ffffff");

    expect(root.children).toHaveLength(2);
    expect(root.children.every((group) => group.userData.crownMolding === true)).toBe(true);
    expect(root.children.every((group) => group.children.length === 3)).toBe(true);
    expect(root.children.flatMap((group) => group.children).filter((mesh) => mesh.userData.crownMoldingFront)).toHaveLength(2);
  });

  it("does not shrink the standard 3D toe-kick width at cabinet seams", () => {
    const root = new THREE.Group();
    addCabinet(root, {
      placementUid: "b24",
      distributorSkuId: 1,
      cabinetId: 1,
      masterCode: "B-24",
      description: "Base",
      placementType: "base",
      width: 24,
      height: 34.5,
      depth: 24,
      numberOfDoors: 2,
      numberOfDrawers: 1,
    }, null, {}, 120, 96, "#ffffff", "#eeeeee", undefined, { x: 12, z: 12, rotation: 0, bottom: 0 });
    let toeKick: THREE.Mesh | null = null;
    root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData.baseToeKick) toeKick = object;
    });
    expect(toeKick).not.toBeNull();
    const geometry = toeKick!.geometry as THREE.BoxGeometry;
    expect(geometry.parameters.width).toBeCloseTo(24 / 12 + 0.02, 6);
  });
});
