import { describe, expect, it } from "vitest";
import { hasCollision, makeSinkForCabinet, type IslandZone, type PlacedCabinet, type RoomData } from "./design";
import {
  ISLAND_COUNTERTOP_OVERHANG_IN,
  islandCountertopRect,
  islandFacePlacement,
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

  it("adds same-face cabinets left-to-right with edge contact and zero overlap", () => {
    const first = nextIslandFacePlacement(cabinet({ uid: "a" }), island, "front", []);
    const second = nextIslandFacePlacement(cabinet({ uid: "b" }), island, "front", [first!]);
    expect(first).toMatchObject({ x: 36, islandOffset: 0 });
    expect(second).toMatchObject({ x: 60, islandOffset: 24 });
    expect(hasCollision(second!, [first!])).toBe(false);
  });

  it("supports 24-inch front and back cabinets touching back-to-back in a 48-inch zone", () => {
    const back = nextIslandFacePlacement(cabinet({ uid: "back" }), island, "back", []);
    const front = nextIslandFacePlacement(cabinet({ uid: "front" }), island, "front", [back!]);
    expect(back!.y + 24).toBe(front!.y);
    expect(hasCollision(front!, [back!])).toBe(false);
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

	  it("keeps exact custom slab dimensions and offsets while cabinet geometry stays authoritative", () => {
	    const attached = islandFacePlacement(cabinet(), island, "front", 0);
	    const custom = { ...island, countertopWidth: 60, countertopDepth: 30, countertopOffsetX: 2, countertopOffsetY: -1 };
	    expect(islandCountertopRect(custom, [attached])).toEqual({ x: 20, y: 56, width: 60, depth: 30 });
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
