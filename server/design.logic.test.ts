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
  isLCornerCabinet,
  isCornerCabinet,
  cornerClipPath,
  cornerLegRatioForPlaced,
  cornerRotationForPlaced,
  placedFootprint,
  RoomData,
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

describe("elevationBox — wall cabinets are BOTTOM-anchored at 54\" by default", () => {
  // Rule: standard wall cabinets (>= 18" tall) hang with their BOTTOM at the
  // 54" mount line (18" above a 36" counter), rising higher as they get taller.
  // Short cabinets (< 30") instead stay TOP-anchored at the 84" line, riding up
  // so their top finishes flush with standard uppers (a 12" bottoms at 72", a
  // 24" at 60").
  // A staggered look is achieved via an explicit mountBottom override.
  it("a 30\" wall cabinet bottoms at 54\" (tops at 84\")", () => {
    const box = elevationBox(mk({ uid: "a", placement: "wall", height: 30 }));
    expect(box.height).toBe(30);
    expect(box.bottom).toBe(WALL_MOUNT_BOTTOM); // 54
    expect(box.bottom + box.height).toBe(84);
  });
  it("a 12\" bridge wall cabinet tops at 84\" (bottoms at 72\")", () => {
    const box = elevationBox(mk({ uid: "a", placement: "wall", height: 12 }));
    expect(box.height).toBe(12);
    expect(box.bottom + box.height).toBe(WALL_CABINET_TOP); // 84
    expect(box.bottom).toBe(72);
  });
  it("a 24\" wall cabinet rides high, top-anchored at 84\" (bottoms at 60\")", () => {
    const box = elevationBox(mk({ uid: "a", placement: "wall", height: 24 }));
    expect(box.bottom + box.height).toBe(WALL_CABINET_TOP); // 84
    expect(box.bottom).toBe(60);
  });
  it("a 42\" wall cabinet bottoms at 54\" (tops at 96\")", () => {
    const box = elevationBox(mk({ uid: "a", placement: "wall", height: 42 }));
    expect(box.bottom).toBe(WALL_MOUNT_BOTTOM); // 54
    expect(box.bottom + box.height).toBe(96);
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

describe("L-corner cabinet (lazy-Susan / blind / easy-reach) footprint", () => {
  const room: RoomData = { width: 120, depth: 120, ceilingHeight: 96 };

  it("detects LSB lazy-Susan and BBC blind-corner codes as L-corners (not diagonal)", () => {
    expect(isLCornerCabinet("LSB36", "36\" Base Easy Reach with Lazy Susan")).toBe(true);
    expect(isLCornerCabinet("LSB33", "33\" Base Easy Reach with Lazy Susan")).toBe(true);
    expect(isLCornerCabinet("LSB36ADA", "36\" Lazy Susan ADA")).toBe(true);
    expect(isLCornerCabinet("BBC-39", "39\" Blind Corner Base Cabinet")).toBe(true);
    expect(isLCornerCabinet("ERB-36", "36\" Base Easy Reach Cabinet")).toBe(true);
    // Diagonal corners are NOT L-corners
    expect(isLCornerCabinet("DCW-24-30", "Diagonal Corner Wall")).toBe(false);
    // Still recognized as a corner cabinet overall
    expect(isCornerCabinet("LSB36", "")).toBe(true);
  });

  it("renders as a square bounding box (side = width) so both legs are 24\" deep", () => {
    const lsb = mk({ uid: "ls", placement: "base", masterCode: "LSB36", description: "36\" Lazy Susan", width: 36, depth: 24 });
    const fp = placedFootprint(lsb);
    expect(fp.w).toBe(36);
    expect(fp.d).toBe(36);
  });

  it("leg-keep ratio matches the Corner Drawer Base (36\" box, 24\" legs = 0.667) for every base L-corner", () => {
    expect(cornerLegRatioForPlaced({ width: 36, placement: "base" })).toBeCloseTo(24 / 36, 5);
    // A 33" unit draws with the SAME standard 36" box, so it also keeps 24/36.
    expect(cornerLegRatioForPlaced({ width: 33, placement: "base" })).toBeCloseTo(24 / 36, 5);
    // wall corners use the 24" box with 12" legs
    expect(cornerLegRatioForPlaced({ width: 24, placement: "wall" })).toBeCloseTo(12 / 24, 5);
  });

  it("clip-path is a 6-point L polygon and differs for each of the 4 corners", () => {
    const ratio = 24 / 36;
    const set = new Set([0, 90, 180, 270].map((r) => cornerClipPath(r, ratio)));
    expect(set.size).toBe(4);
    for (const r of [0, 90, 180, 270]) {
      const cp = cornerClipPath(r, ratio);
      const inner = cp.replace(/^polygon\(/, "").replace(/\)$/, "");
      expect(inner.split(",").length).toBe(6); // L = 6 vertices
    }
  });

  it("orients the notch by which corner the cabinet is seated in", () => {
    const side = 36;
    const mkAt = (x: number, y: number) =>
      mk({ uid: `c-${x}-${y}`, placement: "base", masterCode: "LSB36", description: "36\" Lazy Susan", width: side, depth: side, x, y });
    // back-left corner -> rot 0
    expect(cornerRotationForPlaced(mkAt(0, 0), room)).toBe(0);
    // back-right corner -> rot 90
    expect(cornerRotationForPlaced(mkAt(room.width - side, 0), room)).toBe(90);
    // front-right corner -> rot 180
    expect(cornerRotationForPlaced(mkAt(room.width - side, room.depth - side), room)).toBe(180);
    // front-left corner -> rot 270
    expect(cornerRotationForPlaced(mkAt(0, room.depth - side), room)).toBe(270);
  });

  it("snaps the notch to the NEAREST room corner when not tight to both walls", () => {
    // Previously this fell back to the cabinet's own rotation, which let a
    // not-quite-snapped corner cabinet point its notch at a wall (looked solid).
    // Now it resolves to the nearest corner so the notch always faces the room.
    // A box near the back-right area (center in the top-right quadrant) -> rot 90.
    const nearBackRight = mk({ uid: "f", placement: "base", masterCode: "LSB36", description: "36\" Lazy Susan", width: 36, depth: 36, x: room.width - 40, y: 4, rotation: 90 });
    expect(cornerRotationForPlaced(nearBackRight, room)).toBe(90);
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
