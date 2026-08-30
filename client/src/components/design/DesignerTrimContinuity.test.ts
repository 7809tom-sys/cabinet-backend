import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mergedElevationTrimRuns } from "./ElevationView";
import { addCabinet, addThreeDCrownMolding, diagonalCornerCrownSegments, threeDCrownPerimeterSegments } from "./InteractiveRoom3D";

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

		it("keeps touching same-depth cabinet fronts continuous and returns only at the two run ends", () => {
	  const root = new THREE.Group();
	  const cabinets = [
	    { uid: "w24", cabinetId: 1, masterCode: "W-24-42", description: "Wall", placement: "wall", x: 0, y: 0, width: 24, height: 42, depth: 12, rotation: 0, mountBottom: 54 },
	    { uid: "w30", cabinetId: 2, masterCode: "W-30-42", description: "Wall", placement: "wall", x: 24, y: 0, width: 30, height: 42, depth: 12, rotation: 0, mountBottom: 54 },
	  ] as never[];
	  const room = { width: 120, depth: 96, ceilingHeight: 96 };
	  const segments = threeDCrownPerimeterSegments(cabinets, room);
	  addThreeDCrownMolding(root, cabinets, room, undefined, "#ffffff");

	  expect(segments.filter((segment) => segment.kind === "front")).toHaveLength(2);
	  expect(segments.filter((segment) => segment.kind.endsWith("return"))).toHaveLength(2);
	  expect(segments.some((segment) => segment.kind.endsWith("return") && Math.abs(segment.center.x - 24) < 0.01)).toBe(false);
	  expect(root.children).toHaveLength(4);
		  expect(root.children.every((rail) => rail.userData.crownMolding === true)).toBe(true);
		});

		it("removes internal crown returns across one-eighth-inch legacy offsets in the final Three.js mesh", () => {
		  const root = new THREE.Group();
		  const room = { width: 120, depth: 96, ceilingHeight: 96 };
		  const cabinets = [
		    { uid: "left", cabinetId: 101, masterCode: "W-24-42", description: "Wall", placement: "wall", x: 0, y: 0, width: 24, height: 42, depth: 12, rotation: 0, mountBottom: 54 },
		    { uid: "right", cabinetId: 102, masterCode: "W-30-42", description: "Wall", placement: "wall", x: 24.125, y: 0.125, width: 30, height: 42, depth: 12, rotation: 0, mountBottom: 54.125 },
		  ] as never[];

		  const segments = threeDCrownPerimeterSegments(cabinets, room);
		  addThreeDCrownMolding(root, cabinets, room, undefined, "#ffffff");

		  expect(segments.filter((segment) => segment.kind.endsWith("return"))).toHaveLength(2);
		  expect(segments.some((segment) => segment.kind.endsWith("return") && Math.abs(segment.center.x - 24) < 0.5)).toBe(false);
		  expect(root.children.filter((rail) => rail.userData.crownMoldingReturn)).toHaveLength(2);
		});

		it.each([
		  ["back", { x: 0, y: 0, rotation: 0 }, { x: 24.125, y: 0.125, rotation: 0 }],
		  ["front", { x: 0, y: 84, rotation: 180 }, { x: 24.125, y: 83.875, rotation: 180 }],
		  ["left", { x: 0, y: 0, rotation: 90 }, { x: 0.125, y: 24.125, rotation: 90 }],
		  ["right", { x: 108, y: 0, rotation: 270 }, { x: 107.875, y: 24.125, rotation: 270 }],
		] as const)("keeps only true run-end returns on the %s wall with legacy eighth-inch offsets", (_wall, first, second) => {
		  const root = new THREE.Group();
		  const room = { width: 120, depth: 96, ceilingHeight: 96 };
		  const cabinets = [
		    { uid: "first", cabinetId: 121, masterCode: "W-24-42", description: "Wall", placement: "wall", ...first, width: 24, height: 42, depth: 12, mountBottom: 54 },
		    { uid: "second", cabinetId: 122, masterCode: "W-30-42", description: "Wall", placement: "wall", ...second, width: 30, height: 42, depth: 12, mountBottom: 54.125 },
		  ] as never[];

		  addThreeDCrownMolding(root, cabinets, room, undefined, "#ffffff");
		  expect(root.children.filter((rail) => rail.userData.crownMoldingReturn)).toHaveLength(2);
		});

		it("keeps both crown returns on each side of a true one-inch opening", () => {
		  const room = { width: 120, depth: 96, ceilingHeight: 96 };
		  const segments = threeDCrownPerimeterSegments([
		    { uid: "left", cabinetId: 111, masterCode: "W-24-42", description: "Wall", placement: "wall", x: 0, y: 0, width: 24, height: 42, depth: 12, rotation: 0, mountBottom: 54 },
		    { uid: "right", cabinetId: 112, masterCode: "W-30-42", description: "Wall", placement: "wall", x: 25, y: 0, width: 30, height: 42, depth: 12, rotation: 0, mountBottom: 54 },
		  ] as never[], room);

		  expect(segments.filter((segment) => segment.kind.endsWith("return"))).toHaveLength(4);
		});

		it("wraps the exposed 12-inch step when a 12-inch upper meets a 24-inch-deep cabinet", () => {
	  const room = { width: 120, depth: 96, ceilingHeight: 96 };
	  const segments = threeDCrownPerimeterSegments([
	    { uid: "w24", cabinetId: 21, masterCode: "W-24-42", description: "Wall", placement: "wall", x: 0, y: 0, width: 24, height: 42, depth: 12, rotation: 0, mountBottom: 54 },
	    { uid: "deep24", cabinetId: 22, masterCode: "W-24-42-D24", description: "24-inch deep wall cabinet", placement: "wall", x: 24, y: 0, width: 24, height: 42, depth: 24, rotation: 0, mountBottom: 54 },
	  ] as never[], room);
	  const transitionWrap = segments.find((segment) =>
	    segment.ownerUid === "deep24"
	    && segment.kind === "left-return"
	    && Math.abs(segment.center.x - 24) < 0.01,
	  );

	  expect(transitionWrap?.length).toBeCloseTo(12, 6);
	  expect(transitionWrap?.start.z).toBeCloseTo(24, 6);
	  expect(transitionWrap?.end.z).toBeCloseTo(12, 6);
		  expect(segments.some((segment) => segment.ownerUid === "w24" && segment.kind === "right-return")).toBe(false);
		});

		it("removes the refrigerator bridge right-side return where an adjacent upper continues the run", () => {
		  const room = { width: 120, depth: 96, ceilingHeight: 96 };
		  const segments = threeDCrownPerimeterSegments([
		    { uid: "fridge-bridge", cabinetId: 201, masterCode: "WR3630", description: "Refrigerator bridge cabinet", placement: "wall", x: 0, y: 0, width: 36, height: 30, depth: 24, rotation: 0, mountBottom: 66 },
		    { uid: "right-upper", cabinetId: 202, masterCode: "W-24-30", description: "Wall", placement: "wall", x: 36, y: 0, width: 24, height: 30, depth: 12, rotation: 0, mountBottom: 66 },
		  ] as never[], room);

		  expect(segments.some((segment) => segment.ownerUid === "fridge-bridge" && segment.kind === "right-return")).toBe(false);
		  expect(segments.some((segment) => segment.ownerUid === "fridge-bridge" && segment.kind === "front")).toBe(true);
		  expect(segments.filter((segment) => segment.kind.endsWith("return"))).toHaveLength(2);
		});

		it("removes the refrigerator bridge left-side return where an adjacent upper continues the run", () => {
		  const room = { width: 120, depth: 96, ceilingHeight: 96 };
		  const segments = threeDCrownPerimeterSegments([
		    { uid: "left-upper", cabinetId: 211, masterCode: "W-24-30", description: "Wall", placement: "wall", x: 0, y: 0, width: 24, height: 30, depth: 12, rotation: 0, mountBottom: 66 },
		    { uid: "fridge-bridge", cabinetId: 212, masterCode: "WR3630", description: "Refrigerator bridge cabinet", placement: "wall", x: 24, y: 0, width: 36, height: 30, depth: 24, rotation: 0, mountBottom: 66 },
		  ] as never[], room);

		  expect(segments.some((segment) => segment.ownerUid === "fridge-bridge" && segment.kind === "left-return")).toBe(false);
		  expect(segments.some((segment) => segment.ownerUid === "fridge-bridge" && segment.kind === "front")).toBe(true);
		  expect(segments.filter((segment) => segment.kind.endsWith("return"))).toHaveLength(2);
		});

		it("keeps a refrigerator bridge return when that side is a true exposed run end", () => {
		  const room = { width: 120, depth: 96, ceilingHeight: 96 };
		  const segments = threeDCrownPerimeterSegments([
		    { uid: "fridge-bridge", cabinetId: 221, masterCode: "WR3630", description: "Refrigerator bridge cabinet", placement: "wall", x: 0, y: 0, width: 36, height: 30, depth: 24, rotation: 0, mountBottom: 66 },
		  ] as never[], room);

		  expect(segments.filter((segment) => segment.kind.endsWith("return"))).toHaveLength(2);
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

	  expect(root.children).toHaveLength(12);
	  expect(root.children.every((rail) => rail.userData.diagonalCornerCrown === true)).toBe(true);
	  expect(root.children.filter((rail) => rail.userData.crownMoldingFront)).toHaveLength(4);
	  for (const rail of root.children) {
	    const railLength = ((rail as THREE.Mesh).geometry as THREE.BoxGeometry).parameters.width;
	    expect(railLength).toBeLessThan(2);
	  }
	});

	it("integrates a top-right WDC42 into 12-inch runs on both walls without crown at either hidden cabinet junction", () => {
	  const room = { width: 120, depth: 96, ceilingHeight: 96 };
	  const segments = threeDCrownPerimeterSegments([
	    { uid: "top-run", cabinetId: 31, masterCode: "W-24-42", description: "Wall", placement: "wall", x: 72, y: 0, width: 24, height: 42, depth: 12, rotation: 0, mountBottom: 54 },
	    { uid: "wdc-top-right", cabinetId: 32, masterCode: "WDC2442", description: "Wall Diagonal Corner", placement: "wall", x: 96, y: 0, width: 24, height: 42, depth: 24, rotation: 90, mountBottom: 54, cornerType: "diagonal" },
	    { uid: "right-run", cabinetId: 33, masterCode: "W-24-42", description: "Wall", placement: "wall", x: 108, y: 24, width: 24, height: 42, depth: 12, rotation: 90, mountBottom: 54 },
	  ] as never[], room);
	  const wdcSegments = segments.filter((segment) => segment.ownerUid === "wdc-top-right");

	  expect(wdcSegments.map((segment) => segment.kind)).toEqual(["diagonal-front"]);
	  expect(wdcSegments[0]?.length).toBeCloseTo(Math.hypot(12, 12), 6);
	  expect(segments.filter((segment) => segment.kind.endsWith("return"))).toHaveLength(2);
	});

	it.each([
	  ["top-left", { x: 0, y: 0, rotation: 0 }, { x: 24, y: 0, rotation: 0 }, { x: 0, y: 24, rotation: 90 }],
	  ["top-right", { x: 96, y: 0, rotation: 90 }, { x: 72, y: 0, rotation: 0 }, { x: 108, y: 24, rotation: 90 }],
	  ["bottom-right", { x: 96, y: 72, rotation: 180 }, { x: 72, y: 84, rotation: 180 }, { x: 108, y: 48, rotation: 90 }],
	  ["bottom-left", { x: 0, y: 72, rotation: 270 }, { x: 24, y: 84, rotation: 180 }, { x: 0, y: 48, rotation: 90 }],
	] as const)("keeps only the WDC42 diagonal crown when 12-inch runs join both %s wall legs", (_corner, wdc, horizontal, vertical) => {
	  const room = { width: 120, depth: 96, ceilingHeight: 96 };
	  const segments = threeDCrownPerimeterSegments([
	    { uid: "horizontal-run", cabinetId: 41, masterCode: "W-24-42", description: "Wall", placement: "wall", ...horizontal, width: 24, height: 42, depth: 12, mountBottom: 54 },
	    { uid: "wdc", cabinetId: 42, masterCode: "WDC2442", description: "Wall Diagonal Corner", placement: "wall", ...wdc, width: 24, height: 42, depth: 24, mountBottom: 54, cornerType: "diagonal" },
	    { uid: "vertical-run", cabinetId: 43, masterCode: "W-24-42", description: "Wall", placement: "wall", ...vertical, width: 24, height: 42, depth: 12, mountBottom: 54 },
	  ] as never[], room);
	  const wdcSegments = segments.filter((segment) => segment.ownerUid === "wdc");

	  expect(wdcSegments.map((segment) => segment.kind)).toEqual(["diagonal-front"]);
	  expect(wdcSegments[0]?.length).toBeCloseTo(Math.hypot(12, 12), 6);
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
