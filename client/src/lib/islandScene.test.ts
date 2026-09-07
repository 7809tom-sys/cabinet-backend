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

	it("keeps a shallow W-24-30 island face flush with the exterior edge at counter height", () => {
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
	      y: island.y + island.depth - 12,
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
	    expect(backWallCabinet).toMatchObject({ islandFace: "back", islandOffset: 0, x: island.x, y: island.y });
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
	      y: island.y,
    });
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
	    expect(islandCountertopRect(tenInch, [backBase, frontWallCabinet])).toEqual({ x: 34.5, y: 34.5, width: 27, depth: 59.5 });
	    expect(islandCountertopRect(twelveInch, [backBase, frontWallCabinet])).toEqual({ x: 34.5, y: 34.5, width: 27, depth: 61.5 });
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
