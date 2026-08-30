import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mergedElevationTrimRuns } from "./ElevationView";
import { addCabinet, addThreeDCrownMolding, diagonalCornerCrownSegments } from "./InteractiveRoom3D";

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

	it("follows the WDC42 pentagonal top with two 12-inch returns and its 17-inch diagonal front", () => {
	  const segments = diagonalCornerCrownSegments(24, 24);
	  expect(segments.map((segment) => segment.kind)).toEqual(["right-return", "diagonal-front", "left-return"]);
	  expect(segments.map((segment) => segment.length)).toEqual([
	    12,
	    Math.hypot(12, 12),
	    12,
	  ]);
	  expect(segments.some((segment) => Math.abs(segment.length - 24) < 1e-9)).toBe(false);
	});

	it("renders the same three-piece diagonal WDC42 crown at all four room corners without a square cap", () => {
	  const root = new THREE.Group();
	  const room = { width: 120, depth: 96, ceilingHeight: 96 };
	  addThreeDCrownMolding(root, [
	    { uid: "wdc-top-left", cabinetId: 11, masterCode: "WDC2442", description: "Wall Diagonal Corner", placement: "wall", x: 0, y: 0, width: 24, height: 42, depth: 24, rotation: 0, mountBottom: 54, cornerType: "diagonal" },
	    { uid: "wdc-top-right", cabinetId: 12, masterCode: "WDC2442", description: "Wall Diagonal Corner", placement: "wall", x: 96, y: 0, width: 24, height: 42, depth: 24, rotation: 90, mountBottom: 54, cornerType: "diagonal" },
	    { uid: "wdc-bottom-right", cabinetId: 13, masterCode: "WDC2442", description: "Wall Diagonal Corner", placement: "wall", x: 96, y: 72, width: 24, height: 42, depth: 24, rotation: 180, mountBottom: 54, cornerType: "diagonal" },
	    { uid: "wdc-bottom-left", cabinetId: 14, masterCode: "WDC2442", description: "Wall Diagonal Corner", placement: "wall", x: 0, y: 72, width: 24, height: 42, depth: 24, rotation: 270, mountBottom: 54, cornerType: "diagonal" },
	  ], room, undefined, "#ffffff");

	  expect(root.children).toHaveLength(4);
	  for (const group of root.children) {
	    expect(group.children).toHaveLength(3);
	    expect(group.children.every((rail) => rail.userData.diagonalCornerCrown === true)).toBe(true);
	    expect(group.children.filter((rail) => rail.userData.crownMoldingFront)).toHaveLength(1);
	    const railLengths = group.children.map((rail) => ((rail as THREE.Mesh).geometry as THREE.BoxGeometry).parameters.width);
	    expect(Math.max(...railLengths)).toBeLessThan(2);
	  }
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
