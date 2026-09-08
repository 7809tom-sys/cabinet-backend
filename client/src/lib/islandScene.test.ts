import { describe, expect, it } from "vitest";
import { elevationBox, hasCollision, makeSinkForCabinet, type IslandZone, type PlacedCabinet, type RoomData } from "./design";
import {
  ISLAND_COUNTERTOP_OVERHANG_IN,
	  islandCountertopRect,
	  islandCountertopRects,
	  islandFaceCapacity,
	  islandFaceFitMeasure,
	  islandFacePlacement,
	  islandFaceTransferOption,
	  autoAdjustIslandDepthForBackFace,
	  islandWithFaceSeatingOverhang,
  inferredIslandFace,
  moveIslandScene,
  nextIslandFacePlacement,
  resizeIslandScene,
  rotateIslandScene,
} from "./islandScene";

const room: RoomData = { width: 144, depth: 120 };
const island: IslandZone = { x: 36, y: 36, width: 72, depth: 48, activeFace: "front" };
const cabinet = (overrides: Partial<PlacedCabinet> = {}): PlacedCabinet => ({
  uid: "cab",
  cabinetId: 101,
  masterCode: "B-24",
  description: "24 inch base cabinet",
  placement: "base",
  x: 0,
  y: 0,
  width: 24,
  depth: 24,
  height: 34.5,
  rotation: 0,
  ...overrides,
});

describe("island mini-scene geometry", () => {
  it.each([
    ["front", { x: 36, y: 60, rotation: 0 }],
    ["back", { x: 36, y: 36, rotation: 180 }],
    ["left", { x: 36, y: 36, rotation: 90 }],
    ["right", { x: 84, y: 36, rotation: 270 }],
  ] as const)("places the cabinet on the %s face with its door facing outward", (face, expected) => {
    expect(islandFacePlacement(cabinet(), island, face, 0)).toMatchObject({ ...expected, islandFace: face, islandOffset: 0 });
  });

  it("places a wall catalog cabinet at island floor level while preserving an explicit later elevation edit", () => {
    const wallCabinet = cabinet({ uid: "wfr2442", masterCode: "WFR2442", placement: "wall", depth: 12, height: 42, mountBottom: 54 });
    const floorPlaced = islandFacePlacement(wallCabinet, island, "front", 0);
    expect(floorPlaced).toMatchObject({ islandFace: "front", islandOffset: 0, mountBottom: 0 });
    expect(elevationBox(floorPlaced, room)).toEqual({ bottom: 0, height: 42 });

    const raised = islandFacePlacement({ ...floorPlaced, mountBottom: 6, mountBottomAdjusted: true }, island, "front", 0);
    expect(raised.mountBottom).toBe(6);
    expect(elevationBox(raised, room)).toEqual({ bottom: 6, height: 42 });
  });

	 it("snaps a shallow W-24-30 directly against the back of the opposing base run", () => {
    const backBase = islandFacePlacement(cabinet({ uid: "back-base" }), island, "back", 0);
    const frontWallCabinet = nextIslandFacePlacement(
      cabinet({ uid: "front-w2430", masterCode: "W-24-30", description: "24 inch by 30 inch wall cabinet", placement: "wall", depth: 12, height: 30 }),
      island,
      "front",
      [backBase],
    );
    expect(frontWallCabinet).toMatchObject({
      islandFace: "front",
      islandCounterHeightWallCabinet: true,
      mountBottom: 4.5,
      x: backBase.x,
		      y: backBase.y + 24,
    });
    expect(elevationBox(frontWallCabinet!, room)).toEqual({ bottom: 4.5, height: 30 });
    expect(hasCollision(frontWallCabinet!, [backBase])).toBe(false);
  });

  it("measures a selected island member along its owning face instead of the outer 144-inch room wall", () => {
    const first = islandFacePlacement(cabinet({ uid: "first" }), island, "front", 0);
    const selected = islandFacePlacement(cabinet({ uid: "selected" }), island, "front", 24);
    const measurement = islandFaceFitMeasure(selected, island, [first, selected]);
    expect(measurement).toMatchObject({
      seated: true,
      requiredSpan: 24,
      start: 24,
      end: 48,
      wallLen: 72,
      availableStart: 24,
      availableEnd: 72,
      availableSpan: 48,
      beforeBoundary: "B-24",
      afterBoundary: "island face end",
      snapBefore: 0,
      snapAfter: 24,
      status: "fits",
    });
    expect(measurement?.wallLen).not.toBe(room.width);
  });

	it("adds same-face cabinets left-to-right with edge contact and zero overlap", () => {
	  const first = nextIslandFacePlacement(cabinet({ uid: "a" }), island, "front", []);
	  const second = nextIslandFacePlacement(cabinet({ uid: "b" }), island, "front", [first!]);
	  expect(first).toMatchObject({ x: 36, islandOffset: 0 });
	  expect(second).toMatchObject({ x: 60, islandOffset: 24 });
	  expect(hasCollision(second!, [first!])).toBe(false);
	});

	it("accepts a W30 as an exact fit in a measured 30-inch island-face opening", () => {
	  const exactIsland: IslandZone = { x: 36, y: 36, width: 60, depth: 36, activeFace: "front" };
	  const existing = islandFacePlacement(cabinet({ uid: "front-b30", masterCode: "B-30", width: 30 }), exactIsland, "front", 0);
	  const incoming = cabinet({ uid: "front-w3030", masterCode: "W-30-30", placement: "wall", width: 30, depth: 12, height: 30 });
	  expect(islandFaceCapacity(exactIsland, "front", [existing])).toMatchObject({ largestOpenSpan: 30 });
	  expect(nextIslandFacePlacement(incoming, exactIsland, "front", [existing])).toMatchObject({
	    islandFace: "front",
	    islandOffset: 30,
	    width: 30,
	  });
	});

		it("reports a chosen Front length as full while leaving the opposing Back run available", () => {
		  const frontA = islandFacePlacement(cabinet({ uid: "front-a", width: 36 }), island, "front", 0);
		  const frontB = islandFacePlacement(cabinet({ uid: "front-b", width: 36 }), island, "front", 36);
		  const capacity = islandFaceCapacity(island, "front", [frontA, frontB]);
		  expect(capacity).toMatchObject({ length: 72, occupiedSpan: 72, largestOpenSpan: 0, isFull: true });
		  expect(nextIslandFacePlacement(cabinet({ uid: "back-next", width: 30 }), island, "back", [frontA, frontB])).toMatchObject({ islandFace: "back", islandOffset: 0 });
		});

		it("moves an island cabinet to the opposite face when that face has a clear run", () => {
		  const front = islandFacePlacement(cabinet({ uid: "front", width: 30 }), island, "front", 0);
		  expect(islandFaceTransferOption(front, island, [front])).toMatchObject({
		    targetFace: "back",
		    moved: { uid: "front", islandFace: "back", islandOffset: 0 },
		  });
		});

		it("swaps the nearest opposite-face cabinet when neither face has an open transfer run", () => {
		  const front = islandFacePlacement(cabinet({ uid: "front", width: 72 }), island, "front", 0);
		  const back = islandFacePlacement(cabinet({ uid: "back", width: 72 }), island, "back", 0);
		  expect(islandFaceTransferOption(front, island, [front, back])).toMatchObject({
		    targetFace: "back",
		    moved: { uid: "front", islandFace: "back" },
		    swapped: { uid: "back", islandFace: "front" },
		  });
		});

	  it("places SB36 after a legacy Farm Sink Base on the same island face", () => {
    const legacyFarmSinkBase = {
      ...islandFacePlacement(cabinet({ uid: "legacy-fsb36", masterCode: "FSB-36", description: "36 inch Farm Sink Base Cabinet", width: 36 }), island, "front", 0),
      islandFace: undefined,
      islandOffset: undefined,
    };
    const sinkBase = nextIslandFacePlacement(
      cabinet({ uid: "sb36", masterCode: "SB36", description: "36 inch Sink Base Cabinet", width: 36 }),
      island,
      "front",
      [legacyFarmSinkBase],
    );
    expect(sinkBase).toMatchObject({ islandFace: "front", islandOffset: 36, x: 72, y: 60 });
    expect(hasCollision(sinkBase!, [legacyFarmSinkBase])).toBe(false);
  });

  it("keeps a sequential face run flush even when another face has members", () => {
    const rightSide = nextIslandFacePlacement(cabinet({ uid: "right-side" }), island, "right", []);
    const first = nextIslandFacePlacement(cabinet({ uid: "front-a" }), island, "front", [rightSide!]);
    const second = nextIslandFacePlacement(cabinet({ uid: "front-b" }), island, "front", [rightSide!, first!]);
    expect(first).toMatchObject({ islandFace: "front", islandOffset: 0 });
    expect(second).toMatchObject({ islandFace: "front", islandOffset: 24 });
  });

  it("supports 24-inch front and back cabinets touching back-to-back in a 48-inch zone", () => {
    const back = nextIslandFacePlacement(cabinet({ uid: "back" }), island, "back", []);
    const front = nextIslandFacePlacement(cabinet({ uid: "front" }), island, "front", [back!]);
    expect(back!.y + 24).toBe(front!.y);
    expect(hasCollision(front!, [back!])).toBe(false);
  });

	it("removes the internal void when a shallow Back wall cabinet opposes a Front base run in a deeper island zone", () => {
	  const deeperIsland: IslandZone = { ...island, depth: 60 };
	  const frontBase = islandFacePlacement(cabinet({ uid: "front-base", width: 30, depth: 24 }), deeperIsland, "front", 0);
	  const backWall = nextIslandFacePlacement(
	    cabinet({ uid: "back-wall", masterCode: "W-30-30", description: "30 inch wall cabinet", placement: "wall", width: 30, depth: 12, height: 30 }),
	    deeperIsland,
	    "back",
	    [frontBase],
	  );
	  expect(backWall).toMatchObject({ islandFace: "back", islandOffset: 0, y: frontBase.y - 12 });
	  expect(backWall!.y + 12).toBe(frontBase.y);
	  expect(hasCollision(backWall!, [frontBase])).toBe(false);
	  expect(inferredIslandFace(backWall!, deeperIsland)).toBe("back");
	  expect(islandFaceCapacity(deeperIsland, "back", [frontBase, backWall!])).toMatchObject({ occupiedSpan: 30, largestOpenSpan: 42 });

	  const resized = resizeIslandScene(deeperIsland, [frontBase, backWall!], room, deeperIsland.width, 72);
	  expect(resized.ok).toBe(true);
	  if (resized.ok) {
	    const resizedFront = resized.placed.find((item) => item.uid === frontBase.uid)!;
	    const resizedBack = resized.placed.find((item) => item.uid === backWall!.uid)!;
	    expect(resizedBack.y + 12).toBe(resizedFront.y);
	    expect(inferredIslandFace(resizedBack, resized.island)).toBe("back");
	  }
	});

  it("keeps opposing front and back runs aligned from the same island edge", () => {
    const front = nextIslandFacePlacement(cabinet({ uid: "front-a" }), island, "front", []);
    const back = nextIslandFacePlacement(cabinet({ uid: "back-a" }), island, "back", [front!]);
    expect(back).toMatchObject({ islandFace: "back", islandOffset: 0, x: front!.x });
    expect(hasCollision(back!, [front!])).toBe(false);
  });

  it("uses actual edge geometry when legacy front-run members carry stale Back-face labels", () => {
    const frontB12 = { ...islandFacePlacement(cabinet({ uid: "front-b12", masterCode: "B-12", width: 12 }), island, "front", 0), islandFace: "back", islandOffset: 0 };
    const frontRange = { ...islandFacePlacement(cabinet({ uid: "front-range", masterCode: "RANGE-30", placement: "appliance", width: 30, depth: 24, height: 36 }), island, "front", 12), islandFace: "back", islandOffset: 12 };
    const frontB18 = { ...islandFacePlacement(cabinet({ uid: "front-b18", masterCode: "B-18", width: 18 }), island, "front", 42), islandFace: "back", islandOffset: 42 };
    const existing = [frontB12, frontRange, frontB18];

    expect(existing.map((item) => inferredIslandFace(item, island))).toEqual(["front", "front", "front"]);
    const backWallCabinet = nextIslandFacePlacement(
      cabinet({ uid: "back-w3030", masterCode: "W-30-30", description: "30 inch wall cabinet", placement: "wall", width: 30, depth: 12, height: 30 }),
      island,
      "back",
      existing,
    );
		    expect(backWallCabinet).toMatchObject({ islandFace: "back", islandOffset: 0, x: island.x, y: island.y + 12 });
    expect(hasCollision(backWallCabinet!, existing)).toBe(false);
  });

	  it("protects an occupied front island run while preserving the empty Back face for a W-30-30", () => {
	    const frontB12 = islandFacePlacement(cabinet({ uid: "front-b12", masterCode: "B-12", width: 12 }), island, "front", 0);
	    const frontRange = islandFacePlacement(cabinet({ uid: "front-range", masterCode: "RANGE-30", placement: "appliance", width: 30, depth: 24, height: 36 }), island, "front", 12);
    const frontB18 = islandFacePlacement(cabinet({ uid: "front-b18", masterCode: "B-18", width: 18 }), island, "front", 42);
    const existing = [frontB12, frontRange, frontB18];
    const w3030 = cabinet({ uid: "w3030", masterCode: "W-30-30", description: "30 inch wall cabinet", placement: "wall", width: 30, depth: 12, height: 30 });

    expect(nextIslandFacePlacement(w3030, island, "front", existing)).toBeNull();
    expect(nextIslandFacePlacement(w3030, island, "back", existing)).toMatchObject({
      islandFace: "back",
      islandOffset: 0,
      x: island.x,
		      y: island.y + 12,
	    });
	  });

	  it("places a W-30-30 wall cabinet on the island Back after growing only the Back depth beside a 24-inch Front run", () => {
	    const compactIsland: IslandZone = { ...island, depth: 24 };
	    const frontB18 = islandFacePlacement(cabinet({ uid: "front-b18", masterCode: "B-18", width: 18 }), compactIsland, "front", 0);
	    const frontRange = islandFacePlacement(cabinet({ uid: "front-range", masterCode: "RANGE-30", placement: "appliance", width: 30, depth: 24, height: 36 }), compactIsland, "front", 18);
	    const frontB12 = islandFacePlacement(cabinet({ uid: "front-b12", masterCode: "B-12", width: 12 }), compactIsland, "front", 48);
	    const frontRun = [frontB18, frontRange, frontB12];
	    const w3030 = cabinet({ uid: "island-w3030", masterCode: "W-30-30", description: "30 inch wall cabinet", placement: "wall", width: 30, depth: 12, height: 30 });

	    const expansion = autoAdjustIslandDepthForBackFace(compactIsland, frontRun, room, w3030.depth);
	    expect(expansion).toMatchObject({ ok: true, island: { depth: 36 } });
	    if (!expansion.ok) throw new Error(expansion.reason);
	    const placedW30 = nextIslandFacePlacement(w3030, expansion.island, "back", expansion.placed);

	    expect(placedW30).toMatchObject({
	      islandFace: "back",
	      islandOffset: 0,
	      islandCounterHeightWallCabinet: true,
	      mountBottom: 4.5,
	      width: 30,
	      depth: 12,
	    });
	    expect(hasCollision(placedW30!, expansion.placed)).toBe(false);
	  });

	 it("snaps opposing front and back runs beside a usable end cabinet and fits one slab to the combined shape", () => {
	  const leftEnd = nextIslandFacePlacement(cabinet({ uid: "left-end" }), island, "left", []);
	  const back = nextIslandFacePlacement(cabinet({ uid: "back" }), island, "back", [leftEnd!]);
	  const front = nextIslandFacePlacement(cabinet({ uid: "front" }), island, "front", [leftEnd!, back!]);
	  expect(leftEnd).toMatchObject({ x: 36, y: 36, islandFace: "left", islandOffset: 0 });
	  expect(back).toMatchObject({ x: 60, y: 36, islandFace: "back", islandOffset: 24 });
	  expect(front).toMatchObject({ x: 36, y: 60, islandFace: "front", islandOffset: 0 });
	  expect(hasCollision(back!, [leftEnd!])).toBe(false);
	  expect(hasCollision(front!, [leftEnd!, back!])).toBe(false);
	  expect(islandCountertopRect(island, [leftEnd!, back!, front!])).toEqual({
	    x: 36 - ISLAND_COUNTERTOP_OVERHANG_IN,
	    y: 36 - ISLAND_COUNTERTOP_OVERHANG_IN,
	    width: 48 + ISLAND_COUNTERTOP_OVERHANG_IN * 2,
	    depth: 48 + ISLAND_COUNTERTOP_OVERHANG_IN * 2,
	  });
	});

  it("creates one automatic slab over opposing front and back cabinet runs", () => {
    const back = islandFacePlacement(cabinet({ uid: "back" }), island, "back", 0);
    const front = islandFacePlacement(cabinet({ uid: "front" }), island, "front", 0);
    expect(islandCountertopRect(island, [back, front])).toEqual({
      x: island.x - ISLAND_COUNTERTOP_OVERHANG_IN,
      y: island.y - ISLAND_COUNTERTOP_OVERHANG_IN,
      width: 24 + ISLAND_COUNTERTOP_OVERHANG_IN * 2,
      depth: 48 + ISLAND_COUNTERTOP_OVERHANG_IN * 2,
    });
  });

  it("extends only the selected shallow-wall island face by the chosen 10-inch or 12-inch seating depth", () => {
    const backBase = islandFacePlacement(cabinet({ uid: "back-base" }), island, "back", 0);
    const frontWallCabinet = nextIslandFacePlacement(
      cabinet({ uid: "front-w2430", masterCode: "W-24-30", description: "24 inch by 30 inch wall cabinet", placement: "wall", depth: 12, height: 30 }),
      island,
      "front",
      [backBase],
    )!;
    const tenInch = islandWithFaceSeatingOverhang(island, [backBase, frontWallCabinet], "front", 10);
    const twelveInch = islandWithFaceSeatingOverhang(island, [backBase, frontWallCabinet], "front", 12);
	    expect(islandCountertopRect(tenInch, [backBase, frontWallCabinet])).toEqual({ x: 34.5, y: 34.5, width: 27, depth: 47.5 });
	    expect(islandCountertopRect(twelveInch, [backBase, frontWallCabinet])).toEqual({ x: 34.5, y: 34.5, width: 27, depth: 49.5 });
    expect(twelveInch.countertopWidthAnchoredToZone).toBe(false);
    expect(twelveInch.countertopDepthAnchoredToZone).toBe(false);
  });

  it.each([
    ["front", "bottom"],
    ["back", "top"],
    ["left", "right"],
    ["right", "left"],
  ] as const)("faces an island sink and faucet outward on the %s run", (face, wallSide) => {
    const sinkBase = islandFacePlacement(cabinet({ uid: `sink-${face}`, masterCode: "SB-36", description: "36 inch sink base", width: 36 }), island, face, 0);
    expect(makeSinkForCabinet("double", sinkBase, room, { width: 30, depth: 20 })).toMatchObject({ cabinetUid: sinkBase.uid, wallSide });
  });

  it("moves the island and all attached face members as one collision-safe assembly", () => {
    const attached = islandFacePlacement(cabinet(), island, "front", 12);
    const result = moveIslandScene(island, [attached], room, 6, 3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.island).toMatchObject({ x: 42, y: 39 });
      expect(result.placed[0]).toMatchObject({ x: attached.x + 6, y: attached.y + 3, islandFace: "front", islandOffset: 12 });
    }
  });

	  it("keeps the same W30 face capacity after translating the island across the room", () => {
	    const startingIsland: IslandZone = { x: 6, y: 30, width: 66, depth: 36, activeFace: "front" };
	    const frontB18 = islandFacePlacement(cabinet({ uid: "front-b18", masterCode: "3-DB18", width: 18 }), startingIsland, "front", 0);
	    const frontRange = islandFacePlacement(cabinet({ uid: "front-range", masterCode: "RANGE-30", placement: "appliance", width: 30, depth: 24, height: 36 }), startingIsland, "front", 18);
	    const frontDb12 = islandFacePlacement(cabinet({ uid: "front-db12", masterCode: "3-DB12", width: 12 }), startingIsland, "front", 48);
	    const existing = [frontB18, frontRange, frontDb12];
	    const moved = moveIslandScene(startingIsland, existing, room, 42, 18);
	    expect(moved.ok).toBe(true);
	    if (!moved.ok) return;

	    expect(islandFaceCapacity(startingIsland, "front", existing)).toMatchObject({ length: 66, largestOpenSpan: 6 });
	    expect(islandFaceCapacity(moved.island, "front", moved.placed)).toMatchObject({ length: 66, largestOpenSpan: 6 });
	    expect(moved.placed.map((item) => item.islandOffset)).toEqual(existing.map((item) => item.islandOffset));

	    const w3030 = cabinet({ uid: "back-w3030", masterCode: "W-30-30", placement: "wall", width: 30, depth: 12, height: 30 });
	    const before = nextIslandFacePlacement(w3030, startingIsland, "back", existing);
	    const after = nextIslandFacePlacement(w3030, moved.island, "back", moved.placed);
	    expect(before).toMatchObject({ islandFace: "back", islandOffset: 0 });
	    expect(after).toMatchObject({ islandFace: "back", islandOffset: 0 });
	    expect(after!.x - moved.island.x).toBe(before!.x - startingIsland.x);
	    expect(after!.y - moved.island.y).toBe(before!.y - startingIsland.y);
	  });

	  it("does not move an unrelated room-wall cabinet whose center happens to fall inside an explicit island zone", () => {
	    const attached = islandFacePlacement(cabinet({ uid: "attached" }), island, "front", 12);
	    const roomWallCabinet = cabinet({ uid: "room-wall", masterCode: "B-24", x: island.x + 48, y: island.y + 4, islandFace: undefined, islandOffset: undefined });
	    const result = moveIslandScene(island, [attached, roomWallCabinet], room, 6, 3);
	    expect(result.ok).toBe(true);
	    if (!result.ok) return;
	    expect(result.placed.find((item) => item.uid === "attached")).toMatchObject({ x: attached.x + 6, y: attached.y + 3 });
	    expect(result.placed.find((item) => item.uid === "room-wall")).toEqual(roomWallCabinet);
	  });

	  it("still rejects a translated island and names the real room object and overlap", () => {
	    const attached = islandFacePlacement(cabinet({ uid: "attached" }), island, "front", 12);
	    const roomObject = cabinet({ uid: "room-object", masterCode: "B-24", x: attached.x + 24, y: attached.y, islandFace: undefined, islandOffset: undefined });
	    const result = moveIslandScene(island, [attached, roomObject], room, 6, 0);
	    expect(result).toMatchObject({ ok: false });
	    if (result.ok) return;
	    expect(result.reason).toContain("B-24");
	    expect(result.reason).toContain("footprint overlap");
	  });

  it("quarter-turns the island, every member, active face, and custom slab as one assembly", () => {
    const attached = islandFacePlacement(cabinet(), island, "front", 12);
    const result = rotateIslandScene({ ...island, countertopWidth: 78, countertopDepth: 54, countertopOffsetX: 2, countertopOffsetY: -1 }, [attached], room);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.island).toMatchObject({ width: 48, depth: 72, activeFace: "left", countertopWidth: 54, countertopDepth: 78, countertopOffsetX: 1, countertopOffsetY: 2 });
      expect(result.placed[0]).toMatchObject({ islandFace: "left", rotation: 90 });
    }
  });

	  it("rejects a resize that makes an occupied face too short", () => {
	    const attached = islandFacePlacement(cabinet({ width: 36 }), island, "front", 36);
	    expect(resizeIslandScene(island, [attached], room, 60, 48).ok).toBe(false);
	  });

	  it("names the exact room object and overlap when resizing is physically blocked", () => {
	    const attached = islandFacePlacement(cabinet({ uid: "attached", masterCode: "3-DB18", width: 18 }), island, "front", 0);
	    const blocker = cabinet({ uid: "room-blocker", masterCode: "B-24", x: attached.x, y: island.y + 12, islandFace: undefined, islandOffset: undefined });
	    const result = resizeIslandScene(island, [attached, blocker], room, island.width, 36);
	    expect(result).toMatchObject({ ok: false });
	    if (result.ok) return;
	    expect(result.reason).toContain("Resizing the island would make 3-DB18 overlap B-24");
	    expect(result.reason).toContain("footprint overlap");
	  });

	  it("grows only toward the Back for an incoming deeper Back cabinet while keeping the Front face fixed", () => {
	    const compactIsland = { ...island, depth: 36, y: 48, waterfallEnd: "both" as const, countertopDepth: 48, countertopDepthAnchoredToZone: true };
	    const front = islandFacePlacement(cabinet({ uid: "front", depth: 24, width: 30 }), compactIsland, "front", 0);
	    const result = autoAdjustIslandDepthForBackFace(compactIsland, [front], room, 24);
	    expect(result.ok).toBe(true);
	    if (result.ok) {
	      expect(result.island).toMatchObject({ depth: 48, y: 36, waterfallEnd: "both", countertopDepth: 60, countertopDepthAnchoredToZone: true });
	      expect(result.placed.find((item) => item.uid === "front")).toMatchObject({ x: front.x, y: front.y, islandFace: "front" });
	    }
	  });

	  it("automatically creates one continuous slab with standard overhang over the assembly", () => {
    const left = islandFacePlacement(cabinet({ uid: "left" }), island, "front", 0);
    const right = islandFacePlacement(cabinet({ uid: "right" }), island, "front", 24);
    expect(islandCountertopRect(island, [left, right])).toEqual({
      x: island.x - ISLAND_COUNTERTOP_OVERHANG_IN,
      y: island.y + island.depth - 24 - ISLAND_COUNTERTOP_OVERHANG_IN,
      width: 48 + ISLAND_COUNTERTOP_OVERHANG_IN * 2,
      depth: 24 + ISLAND_COUNTERTOP_OVERHANG_IN * 2,
    });
  });

  it("does not let an automatic countertop bridge an unoccupied island gap", () => {
    const left = islandFacePlacement(cabinet({ uid: "left" }), island, "front", 0);
    const right = islandFacePlacement(cabinet({ uid: "right" }), island, "front", 48);
    expect(islandCountertopRects(island, [left, right])).toEqual([
      { x: island.x - ISLAND_COUNTERTOP_OVERHANG_IN, y: island.y + island.depth - 24 - ISLAND_COUNTERTOP_OVERHANG_IN, width: 24 + ISLAND_COUNTERTOP_OVERHANG_IN * 2, depth: 24 + ISLAND_COUNTERTOP_OVERHANG_IN * 2 },
      { x: island.x + 48 - ISLAND_COUNTERTOP_OVERHANG_IN, y: island.y + island.depth - 24 - ISLAND_COUNTERTOP_OVERHANG_IN, width: 24 + ISLAND_COUNTERTOP_OVERHANG_IN * 2, depth: 24 + ISLAND_COUNTERTOP_OVERHANG_IN * 2 },
    ]);
  });

	  it("keeps exact custom slab dimensions and offsets while cabinet geometry stays authoritative", () => {
	    const attached = islandFacePlacement(cabinet(), island, "front", 0);
	    const custom = { ...island, countertopWidth: 60, countertopDepth: 30, countertopOffsetX: 2, countertopOffsetY: -1 };
	    expect(islandCountertopRect(custom, [attached])).toEqual({ x: 20, y: 56, width: 60, depth: 30 });
	  });

	  it("keeps a guided 12-inch rear seating overhang anchored to the island work zone before a rear cabinet run exists", () => {
	    const workZone = { ...island, depth: 36 };
	    const frontOnly = islandFacePlacement(cabinet({ uid: "front-only" }), workZone, "front", 0);
	    const seatingIsland = {
	      ...workZone,
	      countertopDepth: 48,
	      countertopOffsetY: -6,
	      countertopDepthAnchoredToZone: true,
	    };
	    expect(islandCountertopRect(seatingIsland, [frontOnly])).toMatchObject({
	      y: workZone.y - 12,
	      depth: 48,
	    });
	  });

	  it("recovers a W-30-30 from a 6-inch Front remainder by expanding only toward Back", () => {
	    const compactIsland: IslandZone = { x: 36, y: 48, width: 66, depth: 24, activeFace: "front", autoAdjustDepthForBackFace: true };
	    const frontB18 = islandFacePlacement(cabinet({ uid: "front-b18", masterCode: "B-18", width: 18 }), compactIsland, "front", 0);
	    const frontRange = islandFacePlacement(cabinet({ uid: "front-range", masterCode: "RANGE-30", placement: "appliance", width: 30, depth: 24, height: 36 }), compactIsland, "front", 18);
	    const frontDb12 = islandFacePlacement(cabinet({ uid: "front-db12", masterCode: "3-DB12", width: 12 }), compactIsland, "front", 48);
	    const existing = [frontB18, frontRange, frontDb12];
	    const incoming = cabinet({ uid: "back-w3030", masterCode: "W-30-30", description: "30 inch wall cabinet", placement: "wall", width: 30, depth: 12, height: 30 });

	    expect(islandFaceCapacity(compactIsland, "front", existing).largestOpenSpan).toBe(6);
	    expect(nextIslandFacePlacement(incoming, compactIsland, "front", existing)).toBeNull();
    const adjustment = autoAdjustIslandDepthForBackFace(compactIsland, existing, room, incoming.depth);
    expect(adjustment.ok).toBe(true);
    if (!adjustment.ok) return;
    expect(adjustment.island).toMatchObject({ depth: 36, x: compactIsland.x, y: compactIsland.y - 12 });
	    expect(nextIslandFacePlacement(incoming, adjustment.island, "back", adjustment.placed)).toMatchObject({
	      islandFace: "back",
	      islandOffset: 0,
	      x: compactIsland.x,
	      y: compactIsland.y - 12,
	    });
	  });

		  it("uses the opposing seam in an oversized island while leaving room-wall cabinets outside the assembly", () => {
	    const staleIsland: IslandZone = { x: 24, y: 0, width: 66, depth: 96, activeFace: "front", autoAdjustDepthForBackFace: true };
	    const frontB18 = islandFacePlacement(cabinet({ uid: "front-b18", masterCode: "3-DB18", width: 18 }), staleIsland, "front", 0);
	    const frontRange = islandFacePlacement(cabinet({ uid: "front-range", masterCode: "RANGE-30", placement: "appliance", width: 30, depth: 24, height: 36 }), staleIsland, "front", 18);
	    const frontDb12 = islandFacePlacement(cabinet({ uid: "front-db12", masterCode: "3-DB12", width: 12 }), staleIsland, "front", 48);
	    const roomWallB24 = cabinet({ uid: "room-wall-b24", masterCode: "B-24", x: 24, y: 0, width: 24, depth: 24 });
	    const roomWallErb36 = cabinet({ uid: "room-wall-erb36", masterCode: "ERB36", x: 48, y: 0, width: 36, depth: 24 });
	    const existing = [frontB18, frontRange, frontDb12, roomWallB24, roomWallErb36];
	    const incoming = cabinet({ uid: "back-w3030", masterCode: "W-30-30", placement: "wall", width: 30, depth: 12, height: 30 });

	    expect(islandFaceCapacity(staleIsland, "front", existing).largestOpenSpan).toBe(6);
		    expect(nextIslandFacePlacement(incoming, staleIsland, "back", existing)).toMatchObject({
		      islandFace: "back",
		      islandOffset: 0,
		      x: 24,
		      y: 60,
		    });
	    const adjustment = autoAdjustIslandDepthForBackFace(staleIsland, existing, room, incoming.depth);
	    expect(adjustment.ok).toBe(true);
	    if (!adjustment.ok) return;
	    expect(adjustment.island).toMatchObject({ x: 24, y: 60, width: 66, depth: 36 });
	    expect(adjustment.placed.find((item) => item.uid === roomWallB24.uid)).toEqual(roomWallB24);
	    expect(adjustment.placed.find((item) => item.uid === roomWallErb36.uid)).toEqual(roomWallErb36);
	    expect(islandFaceCapacity(adjustment.island, "back", adjustment.placed).largestOpenSpan).toBe(66);
	    expect(nextIslandFacePlacement(incoming, adjustment.island, "back", adjustment.placed)).toMatchObject({
	      islandFace: "back",
	      islandOffset: 0,
	      x: 24,
	      y: 60,
	    });
	  });

	  it("preserves island face ownership and exact slab metadata through design save and restore", () => {
	    const attached = islandFacePlacement(cabinet({ uid: "saved-island-base" }), island, "right", 12);
	    const savedIsland = {
	      ...island,
	      activeFace: "right" as const,
	      countertopWidth: 80,
	      countertopDepth: 54,
	      countertopOffsetX: 1.5,
	      countertopOffsetY: -0.5,
	      countertopDepthAnchoredToZone: true,
	    };
	    const restored = JSON.parse(JSON.stringify({ island: savedIsland, placed: [attached] })) as {
	      island: IslandZone;
	      placed: PlacedCabinet[];
	    };
	    expect(restored.island).toMatchObject(savedIsland);
	    expect(restored.placed[0]).toMatchObject({ uid: "saved-island-base", islandFace: "right", islandOffset: 12 });
	    expect(islandCountertopRect(restored.island, restored.placed)).toEqual(islandCountertopRect(savedIsland, [attached]));
	  });
	});
