import { describe, it, expect } from "vitest";
import {
  PlacedCabinet,
  placedHeight,
  standardHeight,
  elevationBox,
  WALL_CABINET_TOP,
  WALL_MOUNT_BOTTOM,
  conflictingUids,
  isOnIsland,
  dimLabel,
  isDiagonalCorner,
  diagonalCornerClipPath,
  footprintDepth,
  resolveSwing,
  cycleSwing,
  blindCornerViolations,
} from "../client/src/lib/design";

// Minimal factory for a placed item.
function mk(partial: Partial<PlacedCabinet> & { uid: string; placement: PlacedCabinet["placement"] }): PlacedCabinet {
  return {
    uid: partial.uid,
    cabinetId: partial.cabinetId ?? 1,
    masterCode: partial.masterCode ?? "X",
    description: partial.description ?? "",
    placement: partial.placement,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    width: partial.width ?? 24,
    depth: partial.depth ?? 24,
    height: partial.height,
    swing: partial.swing,
    numberOfDoors: partial.numberOfDoors,
    numberOfDrawers: partial.numberOfDrawers,
    rotation: partial.rotation ?? 0,
  };
}

describe("placedHeight / standardHeight", () => {
  it("uses the real height when present", () => {
    expect(placedHeight(mk({ uid: "a", placement: "wall", height: 42 }))).toBe(42);
  });
  it("falls back to the bucket standard when height is missing (legacy designs)", () => {
    expect(placedHeight(mk({ uid: "a", placement: "wall" }))).toBe(standardHeight("wall"));
    expect(placedHeight(mk({ uid: "b", placement: "tall" }))).toBe(standardHeight("tall"));
    expect(placedHeight(mk({ uid: "c", placement: "base" }))).toBe(standardHeight("base"));
  });
  it("ignores a zero/negative height and falls back", () => {
    expect(placedHeight(mk({ uid: "a", placement: "wall", height: 0 }))).toBe(standardHeight("wall"));
  });
});

describe("elevationBox — wall cabinets are TOP-anchored at 84\" by default", () => {
  // Rule: every wall cabinet's TOP seals at the standard 84" line so a run
  // reads as one clean line across the top. Bottom = 84 - height. A 30"
  // bottoms at 54", a 24" at 60", and a 12" bridge (over a fridge/range)
  // bottoms at 72". A staggered look is achieved via an explicit mountBottom.
  it("a 30\" wall cabinet tops at 84\" (bottoms at 54\")", () => {
    const box = elevationBox(mk({ uid: "a", placement: "wall", height: 30 }));
    expect(box.height).toBe(30);
    expect(box.bottom + box.height).toBe(WALL_CABINET_TOP); // 84
    expect(box.bottom).toBe(54);
  });
  it("a 12\" bridge wall cabinet tops at 84\" (bottoms at 72\")", () => {
    const box = elevationBox(mk({ uid: "a", placement: "wall", height: 12 }));
    expect(box.height).toBe(12);
    expect(box.bottom + box.height).toBe(WALL_CABINET_TOP); // 84
    expect(box.bottom).toBe(72);
  });
  it("a 24\" wall cabinet tops at 84\" (bottoms at 60\")", () => {
    const box = elevationBox(mk({ uid: "a", placement: "wall", height: 24 }));
    expect(box.bottom + box.height).toBe(WALL_CABINET_TOP); // 84
    expect(box.bottom).toBe(60);
  });
  it("two different wall cabinet heights do NOT render identically", () => {
    const tall = elevationBox(mk({ uid: "a", placement: "wall", height: 42 }));
    const short = elevationBox(mk({ uid: "b", placement: "wall", height: 30 }));
    expect(tall.height).not.toBe(short.height);
  });
});

describe("conflictingUids — appliance running into a cabinet", () => {
  it("flags a base cabinet overlapping a range", () => {
    const range = mk({ uid: "r", placement: "appliance", masterCode: "RANGE-30", x: 0, y: 0, width: 30, depth: 25 });
    const base = mk({ uid: "b", placement: "base", masterCode: "B24", x: 10, y: 0, width: 24, depth: 24 });
    const c = conflictingUids([range, base]);
    expect(c.has("r")).toBe(true);
    expect(c.has("b")).toBe(true);
  });
  it("does NOT flag a base cabinet sitting flush beside an appliance", () => {
    const range = mk({ uid: "r", placement: "appliance", masterCode: "RANGE-30", x: 0, y: 0, width: 30, depth: 25 });
    const base = mk({ uid: "b", placement: "base", masterCode: "B24", x: 30, y: 0, width: 24, depth: 24 });
    const c = conflictingUids([range, base]);
    expect(c.size).toBe(0);
  });
  it("does NOT flag a wall cabinet above a floor-standing range (different zones)", () => {
    const range = mk({ uid: "r", placement: "appliance", masterCode: "RANGE-30", x: 0, y: 0, width: 30, depth: 25 });
    const wall = mk({ uid: "w", placement: "wall", masterCode: "W3030", x: 0, y: 0, width: 30, depth: 12 });
    const c = conflictingUids([range, wall]);
    expect(c.size).toBe(0);
  });
  it("does NOT flag two cabinets against each other (only appliance-vs-cabinet)", () => {
    const a = mk({ uid: "a", placement: "base", x: 0, y: 0, width: 24, depth: 24 });
    const b = mk({ uid: "b", placement: "base", x: 5, y: 0, width: 24, depth: 24 });
    const c = conflictingUids([a, b]);
    expect(c.size).toBe(0);
  });
});

describe("isOnIsland", () => {
  const island = { x: 50, y: 40, width: 48, depth: 24 };
  it("returns true when the cabinet center is inside the island", () => {
    const cab = mk({ uid: "a", placement: "base", x: 56, y: 46, width: 24, depth: 12 });
    expect(isOnIsland(cab, island)).toBe(true);
  });
  it("returns false when the cabinet is outside the island", () => {
    const cab = mk({ uid: "a", placement: "base", x: 0, y: 0, width: 24, depth: 24 });
    expect(isOnIsland(cab, island)).toBe(false);
  });
  it("treats a WALL cabinet on the island the same as a base cabinet (wall uppers allowed on islands)", () => {
    const wallCab = mk({ uid: "w", placement: "wall", x: 56, y: 46, width: 24, depth: 12 });
    expect(isOnIsland(wallCab, island)).toBe(true);
  });
});

describe("dimLabel — full W x H x D", () => {
  it("formats W x H x D and drops trailing zeros", () => {
    const cab = mk({ uid: "a", placement: "base", width: 24, depth: 24, height: 34.5 });
    expect(dimLabel(cab)).toBe('24"W \u00d7 34.5"H \u00d7 24"D');
  });
  it("swaps width/depth when rotated 90 degrees", () => {
    const cab = mk({ uid: "a", placement: "base", width: 24, depth: 12, height: 34.5, rotation: 90 });
    expect(dimLabel(cab)).toBe('12"W \u00d7 34.5"H \u00d7 24"D');
  });
});

describe("diagonal corner wall cabinet", () => {
  it("detects DCW codes and 'diagonal' descriptions as diagonal corners", () => {
    expect(isDiagonalCorner("DCW-24-30", "24x30 Diagonal Corner Wall Cabinet")).toBe(true);
    expect(isDiagonalCorner("WDC2442", "")).toBe(true);
    expect(isDiagonalCorner("W3030", "30 Wall Cabinet")).toBe(false);
  });
  it("clip-path is a 5-point pentagon (two 12\" legs + 45-degree face)", () => {
    const cp = diagonalCornerClipPath(0, 0.5);
    // pentagon => 5 coordinate pairs (4 commas inside the polygon)
    const inner = cp.replace(/^polygon\(/, "").replace(/\)$/, "");
    expect(inner.split(",").length).toBe(5);
    expect(cp).toContain("50%");
  });
  it("rotates to a different polygon for each orientation", () => {
    const set = new Set([0, 90, 180, 270].map((r) => diagonalCornerClipPath(r)));
    expect(set.size).toBe(4);
  });
  it("footprint depth equals its width (square bounding box) so the angle reads", () => {
    const dcw = { masterCode: "DCW-24-30", description: "Diagonal Corner Wall", category: "Wall", subCategory: "Diagonal Corner Wall", width: "24", height: "30", depth: "12", placement: "wall" as const, numberOfDoors: 1, numberOfDrawers: 0, isCornerCabinet: true, id: 1 };
    expect(footprintDepth(dcw)).toBe(24);
  });
});

describe("door swing (hinge side)", () => {
  it("defaults a single-door cabinet to a left hinge", () => {
    const cab = mk({ uid: "a", placement: "base", masterCode: "B18", numberOfDoors: 1 });
    expect(resolveSwing(cab)).toBe("left");
  });
  it("defaults a two-door cabinet to double", () => {
    const cab = mk({ uid: "a", placement: "base", masterCode: "B36", numberOfDoors: 2 });
    expect(resolveSwing(cab)).toBe("double");
  });
  it("treats appliances as no swing", () => {
    const cab = mk({ uid: "a", placement: "appliance", masterCode: "RANGE-30" });
    expect(resolveSwing(cab)).toBe("none");
  });
  it("cycles a single door left <-> right but leaves double alone", () => {
    expect(cycleSwing("left")).toBe("right");
    expect(cycleSwing("right")).toBe("left");
    expect(cycleSwing("double")).toBe("double");
  });
});

describe("blind corner rule", () => {
  // A blind base corner at x:0..24 (y:0..24). Neighbor along x to its right.
  const blind = mk({
    uid: "blind",
    placement: "base",
    masterCode: "BBC-42",
    description: "Blind Base Corner Cabinet",
    x: 0, y: 0, width: 24, depth: 24,
  });

  it("flags a neighbor butted right against the blind corner (no 3\" pull)", () => {
    const neighbor = mk({ uid: "n", placement: "base", masterCode: "B30", x: 24, y: 0, width: 30, depth: 24 });
    const bad = blindCornerViolations([blind, neighbor]);
    expect(bad.has("blind")).toBe(true);
  });

  it("passes when the neighbor is pulled 3\" off the corner", () => {
    const neighbor = mk({ uid: "n", placement: "base", masterCode: "B30", x: 27, y: 0, width: 30, depth: 24 });
    const bad = blindCornerViolations([blind, neighbor]);
    expect(bad.has("blind")).toBe(false);
  });

  it("ignores non-blind cabinets", () => {
    const a = mk({ uid: "a", placement: "base", masterCode: "B24", x: 0, y: 0, width: 24, depth: 24 });
    const b = mk({ uid: "b", placement: "base", masterCode: "B30", x: 24, y: 0, width: 30, depth: 24 });
    expect(blindCornerViolations([a, b]).size).toBe(0);
  });
});
