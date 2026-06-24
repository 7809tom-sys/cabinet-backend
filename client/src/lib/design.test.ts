import { describe, it, expect } from "vitest";
import {
  isCornerCabinet, cornerClipPath, centerDistance, formatInches,
  isApplianceCode, applianceAsDesignCabinet, elevationBox, APPLIANCES,
  appliancesForRoom, ROOM_TYPES,
  makeOpening, clampOpening, wallLength, OPENINGS,
  snapToWall, feetInchesToInches, inchesToFeetInches, clampRoomInches,
  ROOM_MIN_IN, ROOM_MAX_IN,
  nextFreeSpotOnWall, clampCabinetToRoom, clampCabinetsToRoom,
  clampIslandToRoom, WALL_LABELS, resizeRoomByWall,
  crownLinearInches, toeKickLinearInches, trimPiecesNeeded,
  miteredTrimInches, cabinetWall, countertopArea,
  MITER_ALLOWANCE_IN, COUNTERTOP_DEPTH_IN,
  doorPanelKind, wallSpanMeasure,
  countertopSurfaces, countertopMaterial, makeSink, COUNTERTOP_DEPTH_IN as CT_DEPTH,
  freeSegmentsOnWall, wallPlacementAt,
  rangeOvenClearanceViolations, RANGE_CLEARANCE_FILLER_IN,
  wallOpeningClearanceViolations, WALL_OPENING_CLEARANCE_IN,
  blindCornerSpecViolations, blindPullRange,
  blindCornerAutoFiller,
  isStacker,
  isDiagonalCorner, footprintDepth,
  isLCornerCabinet, cornerLegRatioForPlaced, placedFootprint, normalizeLCornerDepths,
  resolveSwing, cycleSwing, swingLabel, swingText, hasDoorSwing, type DoorSwing,
  type PlacedCabinet, type RoomData, type WallOpening,
} from "./design";

const ROOM_12x10: RoomData = { width: 144, depth: 120 };

function cab(partial: Partial<PlacedCabinet>): PlacedCabinet {
  return {
    uid: "u",
    cabinetId: 1,
    masterCode: "B-24",
    description: "Base 24",
    placement: "base",
    x: 0,
    y: 0,
    width: 24,
    depth: 24,
    rotation: 0,
    ...partial,
  };
}

describe("corner cabinet detection", () => {
  it("detects corner cabinets by master-code prefix", () => {
    expect(isCornerCabinet("BBC-36")).toBe(true); // blind corner base
    expect(isCornerCabinet("WBC-24-30")).toBe(true); // wall blind corner
    expect(isCornerCabinet("LSB36")).toBe(true); // lazy susan
    expect(isCornerCabinet("BEC-24")).toBe(false); // base END cabinet, NOT a corner
    expect(isCornerCabinet("ERB-33")).toBe(true); // easy reach corner base
    expect(isCornerCabinet("BER-36")).toBe(true); // Skyline easy reach corner base alias
    expect(isCornerCabinet("BES-12")).toBe(false); // base end shelf is NOT a corner
    expect(isCornerCabinet("CSB-36")).toBe(true); // corner sink base
  });

  it("detects corner cabinets by description when code is generic", () => {
    expect(isCornerCabinet("X-99", "36in Lazy Susan corner")).toBe(true);
    expect(isCornerCabinet("X-99", "Easy Reach corner base")).toBe(true);
  });

  it("does not flag ordinary cabinets as corners", () => {
    expect(isCornerCabinet("B-24", "Base 24 inch")).toBe(false);
    expect(isCornerCabinet("SB-36", "Sink Base 36")).toBe(false);
    expect(isCornerCabinet("W-30-30", "Wall 30x30")).toBe(false);
  });
});

describe("corner clip path", () => {
  it("produces a 6-point L-shaped polygon for every rotation", () => {
    for (const rot of [0, 90, 180, 270]) {
      const path = cornerClipPath(rot);
      expect(path.startsWith("polygon(")).toBe(true);
      // An L-shape has 6 vertices.
      const points = path.replace(/polygon\(|\)/g, "").split(",");
      expect(points).toHaveLength(6);
    }
  });

  it("normalizes out-of-range rotation", () => {
    expect(cornerClipPath(360)).toBe(cornerClipPath(0));
    expect(cornerClipPath(-90)).toBe(cornerClipPath(270));
  });
});

describe("appliances", () => {
  it("defines the core kitchen appliances", () => {
    const codes = APPLIANCES.map((a) => a.masterCode);
    expect(codes).toContain("RANGE-30");
    expect(codes).toContain("FRIDGE-30");
    expect(codes).toContain("FRIDGE-36");
    expect(codes).toContain("DW-24");
    expect(codes).toContain("SINK-33");
    expect(codes).toContain("HOOD-30");
  });

  it("offers both a 30in and a 36in refrigerator, each 30in deep", () => {
    const f30 = APPLIANCES.find((a) => a.masterCode === "FRIDGE-30")!;
    const f36 = APPLIANCES.find((a) => a.masterCode === "FRIDGE-36")!;
    expect(f30.width).toBe(30);
    expect(f36.width).toBe(36);
    expect(f30.depth).toBe(30);
    expect(f36.depth).toBe(30);
  });

  it("detects appliance + fixture master codes", () => {
    expect(isApplianceCode("RANGE-30")).toBe(true);
    expect(isApplianceCode("FRIDGE-36")).toBe(true);
    expect(isApplianceCode("FIX-WASHER-27")).toBe(true);
    expect(isApplianceCode("FIX-TOILET")).toBe(true);
    expect(isApplianceCode("B-24")).toBe(false);
  });

  it("filters appliances/fixtures by room type", () => {
    const kitchen = appliancesForRoom("kitchen").map((a) => a.masterCode);
    expect(kitchen).toContain("RANGE-30");
    expect(kitchen).toContain("FRIDGE-30");
    expect(kitchen).not.toContain("FIX-TOILET");

    const bath = appliancesForRoom("bathroom").map((a) => a.masterCode);
    expect(bath).toContain("FIX-SHOWER-36");
    expect(bath).toContain("FIX-TUB-60");
    expect(bath).toContain("FIX-TOILET");
    expect(bath).not.toContain("RANGE-30");

    const laundry = appliancesForRoom("laundry").map((a) => a.masterCode);
    expect(laundry).toContain("FIX-WASHER-27");
    expect(laundry).toContain("FIX-DRYER-27");
    expect(laundry).toContain("FIX-LAUNDRYTUB-25");

    // Closet and Other have no fixtures of their own.
    expect(appliancesForRoom("closet")).toHaveLength(0);
    expect(appliancesForRoom("other")).toHaveLength(0);
  });

  it("exposes five room types", () => {
    expect(ROOM_TYPES.map((r) => r.value)).toEqual([
      "kitchen", "bathroom", "laundry", "closet", "other",
    ]);
  });

  it("gives bath/laundry fixtures a usable elevation box", () => {
    for (const code of ["FIX-SHOWER-36", "FIX-TUB-60", "FIX-WASHER-27"]) {
      const fx: PlacedCabinet = cab({ masterCode: code, placement: "appliance", cabinetId: 0 });
      const box = elevationBox(fx);
      expect(box.height).toBeGreaterThan(0);
    }
  });

  it("converts an appliance to a placeable design cabinet with id 0", () => {
    const range = APPLIANCES.find((a) => a.key === "range")!;
    const dc = applianceAsDesignCabinet(range);
    expect(dc.id).toBe(0); // unpriced
    expect(dc.placement).toBe("appliance");
    expect(dc.masterCode).toBe("RANGE-30");
  });

  it("gives appliances their own elevation box", () => {
    const hood: PlacedCabinet = cab({ masterCode: "HOOD-30", placement: "appliance", cabinetId: 0 });
    const box = elevationBox(hood);
    expect(box.bottom).toBeGreaterThan(0); // hood is mounted high
  });
});

describe("distance + formatting helpers", () => {
  it("measures center-to-center distance in inches", () => {
    const a = cab({ x: 0, y: 0, width: 24, depth: 24 }); // center 12,12
    const b = cab({ x: 36, y: 0, width: 24, depth: 24 }); // center 48,12
    expect(Math.round(centerDistance(a, b))).toBe(36);
  });

  it("accounts for rotation when measuring", () => {
    const a = cab({ x: 0, y: 0, width: 24, depth: 12, rotation: 0 }); // center 12,6
    const b = cab({ x: 0, y: 24, width: 24, depth: 12, rotation: 0 }); // center 12,30
    expect(Math.round(centerDistance(a, b))).toBe(24);
  });

  it("formats inches as feet and inches", () => {
    expect(formatInches(11)).toBe('11"');
    expect(formatInches(12)).toBe("1'");
    expect(formatInches(30)).toBe(`2' 6"`);
  });
});

describe("wall openings (doors & windows)", () => {
  const room = { width: 120, depth: 96 };

  it("wallLength returns width for top/bottom and depth for left/right", () => {
    expect(wallLength("top", room)).toBe(120);
    expect(wallLength("bottom", room)).toBe(120);
    expect(wallLength("left", room)).toBe(96);
    expect(wallLength("right", room)).toBe(96);
  });

  it("centers a new opening on its wall", () => {
    const def = OPENINGS.find((o) => o.key === "entry-door")!;
    const o = makeOpening(def, "bottom", room);
    expect(o.kind).toBe("door");
    expect(o.width).toBe(36);
    // centered: (120 - 36) / 2 = 42
    expect(o.offset).toBe(42);
  });

  it("clamps offset so the opening stays within the wall", () => {
    const def = OPENINGS.find((o) => o.key === "window-std")!;
    const o = makeOpening(def, "top", room);
    const pushed = clampOpening({ ...o, offset: 1000 }, room);
    expect(pushed.offset).toBeLessThanOrEqual(room.width - pushed.width);
    expect(pushed.offset).toBeGreaterThanOrEqual(0);
  });

  it("clamps width so it never exceeds the wall length", () => {
    const def = OPENINGS.find((o) => o.key === "patio-door")!;
    const o = makeOpening(def, "left", room);
    const wide = clampOpening({ ...o, width: 500 }, room);
    expect(wide.width).toBeLessThanOrEqual(wallLength("left", room));
  });

  it("windows have a non-zero sill height; doors sit on the floor", () => {
    const win = OPENINGS.find((o) => o.kind === "window")!;
    const door = OPENINGS.find((o) => o.kind === "door")!;
    expect(win.sill).toBeGreaterThan(0);
    expect(door.sill).toBe(0);
  });
});

import {
  finishColors, DEFAULT_FINISH_COLORS,
  crownLinearInches, toeKickLinearInches, lightRailLinearInches, inchesToLinearFeet,
  battenLinearInches, BATTEN_WIDTH_IN, BATTEN_THICKNESS_IN,
} from "./design";

describe("finishColors", () => {
  it("maps white-family styles to a light face", () => {
    expect(finishColors("Arctic White Shaker").face.toLowerCase()).toBe("#f3f1ec");
  });
  it("maps navy styles to a blue face with light label", () => {
    const f = finishColors("Ocean Navy");
    expect(f.face.toLowerCase()).toBe("#3b4d63");
    expect(f.label.toLowerCase()).toBe("#f8fafc");
  });
  it("maps grey styles to a grey face", () => {
    expect(finishColors("Pewter Grey").face.toLowerCase()).toBe("#9aa0a6");
  });
  it("derives the finish from the paint color even when the brand name is abstract", () => {
    // "Aero Obsidian" brand word isn't a color, but its paint color is black.
    expect(finishColors("Aero Obsidian", "SW 6258 Tricorn Black").face.toLowerCase()).toBe("#2b2b2e");
  });
  it("returns a deterministic, non-default color for unmatched names", () => {
    const a = finishColors("Zorptacular");
    const b = finishColors("Zorptacular");
    // Stable across calls for the same input.
    expect(a).toEqual(b);
    // Always a valid hex face.
    expect(a.face).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("gives two different unmatched names a chance to differ (no global collapse)", () => {
    // Not a strict guarantee for every pair, but these two hash to different buckets.
    const a = finishColors("Quibblefoo");
    const b = finishColors("Wozzlebkdj");
    expect(a.face === b.face && a.edge === b.edge).toBe(false);
  });
  it("handles null/empty input safely (returns the default finish)", () => {
    expect(finishColors(null)).toEqual(DEFAULT_FINISH_COLORS);
    expect(finishColors("")).toEqual(DEFAULT_FINISH_COLORS);
  });
});

describe("trim linear footage", () => {
  it("crown sums only wall cabinet widths", () => {
    const placed = [
      cab({ placement: "wall", width: 30 }),
      cab({ placement: "wall", width: 24 }),
      cab({ placement: "base", width: 36 }),
      cab({ placement: "appliance", width: 30, cabinetId: 0 }),
    ];
    // 30 + 24 = 54 run, + 3in miter allowance = 57.
    expect(crownLinearInches(placed)).toBe(57);
  });
  it("toe kick sums base and tall widths, not wall or appliance", () => {
    const placed = [
      cab({ placement: "base", width: 36 }),
      cab({ placement: "tall", width: 24 }),
      cab({ placement: "wall", width: 30 }),
    ];
    expect(toeKickLinearInches(placed)).toBe(60);
  });
  it("converts inches to linear feet rounded up to 0.1", () => {
    expect(inchesToLinearFeet(54)).toBe(4.5);
    expect(inchesToLinearFeet(13)).toBeCloseTo(1.1, 5);
  });
  it("respects rotated width for crown", () => {
    const placed = [cab({ placement: "wall", width: 30, depth: 12, rotation: 90 })];
    // rotated width 12 + 3in miter allowance = 15.
    expect(crownLinearInches(placed)).toBe(15);
  });
  it("light rail sums ONLY wall cabinet widths (not base/tall/appliance)", () => {
    const placed = [
      cab({ placement: "wall", width: 30 }),
      cab({ placement: "wall", width: 24 }),
      cab({ placement: "tall", width: 24 }),
      cab({ placement: "base", width: 36 }),
    ];
    // 30 + 24 = 54 wall run, + 3in miter allowance = 57 (tall/base excluded).
    expect(lightRailLinearInches(placed)).toBe(57);
  });
  it("light rail is zero when there are no wall cabinets", () => {
    const placed = [cab({ placement: "base", width: 36 }), cab({ placement: "tall", width: 24 })];
    expect(lightRailLinearInches(placed)).toBe(0);
  });
});

import { isBlindCorner, blindCornerFillers, BLIND_CORNER_FILLER_WIDTH_IN } from "./design";

describe("blind corner fillers", () => {
  it("detects blind corner base/wall codes", () => {
    expect(isBlindCorner("BBC-36")).toBe(true);
    expect(isBlindCorner("WBC-24-30")).toBe(true);
    expect(isBlindCorner("BBL-42")).toBe(true);
    expect(isBlindCorner("W-30-30")).toBe(false);
    expect(isBlindCorner("B-24")).toBe(false);
  });

  it("detects blind corner by description", () => {
    expect(isBlindCorner("X-1", "36in Blind Corner Base")).toBe(true);
    expect(isBlindCorner("X-2", "Lazy Susan Corner")).toBe(false);
  });

  it("adds one base filler per blind base corner", () => {
    const f = blindCornerFillers([cab({ masterCode: "BBC-36", placement: "base" }), cab({ masterCode: "B-24", placement: "base" })]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ kind: "base", count: 1, width: BLIND_CORNER_FILLER_WIDTH_IN });
  });

  it("splits base and wall blind-corner fillers", () => {
    const f = blindCornerFillers([
      cab({ masterCode: "BBC-36", placement: "base" }),
      cab({ masterCode: "WBC-24-30", placement: "wall" }),
      cab({ masterCode: "WBC-24-30", placement: "wall" }),
    ]);
    expect(f.find((x) => x.kind === "base")?.count).toBe(1);
    expect(f.find((x) => x.kind === "wall")?.count).toBe(2);
  });

  it("returns no fillers when there are no blind corners", () => {
    expect(blindCornerFillers([cab({ masterCode: "B-24", placement: "base" }), cab({ masterCode: "W-30-30", placement: "wall" })])).toHaveLength(0);
  });
});

describe("snapToWall — explicit wall placement", () => {
  const room = { width: 144, depth: 120 };

  it("snaps to the top wall (y=0) keeping x", () => {
    const r = snapToWall(cab({ x: 40, y: 60, width: 24, depth: 24 }), "top", room);
    expect(r.y).toBe(0);
    expect(r.x).toBe(40);
  });

  it("snaps to the bottom wall flush against the far edge", () => {
    const r = snapToWall(cab({ x: 40, y: 10, width: 24, depth: 24 }), "bottom", room);
    expect(r.y).toBe(120 - 24);
  });

  it("snaps to the left wall (x=0)", () => {
    const r = snapToWall(cab({ x: 80, y: 30, width: 24, depth: 24 }), "left", room);
    expect(r.x).toBe(0);
  });

  it("snaps to the right wall flush against the far edge", () => {
    const r = snapToWall(cab({ x: 10, y: 30, width: 24, depth: 24 }), "right", room);
    expect(r.x).toBe(144 - 24);
  });

  it("respects rotation when computing the flush position", () => {
    // rotated 90° => footprint w/d swap (width 36 becomes depth)
    const r = snapToWall(cab({ x: 0, y: 0, width: 36, depth: 12, rotation: 90 }), "right", room);
    // rotated width is the original depth (12), so flush right is 144-12
    expect(r.x).toBe(144 - 12);
  });

  it("keeps the cabinet inside the room when its along-wall pos is out of range", () => {
    const r = snapToWall(cab({ x: 200, y: 30, width: 24, depth: 24 }), "top", room);
    expect(r.x).toBe(144 - 24);
    expect(r.y).toBe(0);
  });
});

describe("room dimension helpers", () => {
  it("converts feet + inches to total inches", () => {
    expect(feetInchesToInches(10, 0)).toBe(120);
    expect(feetInchesToInches(10, 6)).toBe(126);
    expect(feetInchesToInches(12, 0)).toBe(144);
  });

  it("converts inches back to feet + inches", () => {
    expect(inchesToFeetInches(120)).toEqual({ feet: 10, inches: 0 });
    expect(inchesToFeetInches(126)).toEqual({ feet: 10, inches: 6 });
  });

  it("clamps to the allowed kitchen range", () => {
    expect(clampRoomInches(10)).toBe(ROOM_MIN_IN);
    expect(clampRoomInches(9999)).toBe(ROOM_MAX_IN);
    expect(clampRoomInches(144)).toBe(144);
  });

  it("clamps when converting feet/inches out of range", () => {
    expect(feetInchesToInches(0, 1)).toBe(ROOM_MIN_IN); // too small -> min
    expect(feetInchesToInches(99, 0)).toBe(ROOM_MAX_IN); // too big -> max
  });
});


describe("active-wall placement", () => {
  const room = { width: 144, depth: 120 };

  it("places first item flush to the back (top) wall at the start corner", () => {
    const spot = nextFreeSpotOnWall(24, 24, "base", "top", room, []);
    expect(spot).toEqual({ x: 0, y: 0, rotation: 0 });
  });

  it("places first item flush to the front (bottom) wall", () => {
    const spot = nextFreeSpotOnWall(24, 24, "base", "bottom", room, []);
    expect(spot.y).toBe(room.depth - 24); // 96
    expect(spot.x).toBe(0);
    expect(spot.rotation).toBe(0);
  });

  it("rotates items 90deg on the left/right walls so depth faces into the room", () => {
    const left = nextFreeSpotOnWall(24, 24, "base", "left", room, []);
    expect(left).toEqual({ x: 0, y: 0, rotation: 90 });
    const right = nextFreeSpotOnWall(30, 24, "base", "right", room, []);
    // 30 wide cabinet rotated -> 24 deep faces into room from the right wall
    expect(right.x).toBe(room.width - 24); // 120
    expect(right.rotation).toBe(90);
  });

  it("marches subsequent items along the wall, packing flush", () => {
    const first: PlacedCabinet = cab({ uid: "a", x: 0, y: 0, width: 24, depth: 24 });
    const spot = nextFreeSpotOnWall(30, 24, "base", "top", room, [first]);
    expect(spot.x).toBe(24); // packed right after the 24" cabinet
    expect(spot.y).toBe(0);
  });

  it("ignores items on other walls when packing", () => {
    const onFront: PlacedCabinet = cab({ uid: "f", x: 0, y: 96, width: 24, depth: 24 });
    const spot = nextFreeSpotOnWall(24, 24, "base", "top", room, [onFront]);
    expect(spot.x).toBe(0); // back wall is empty
  });

  it("clamps to the wall end when the wall is full", () => {
    const wide: PlacedCabinet = cab({ uid: "w", x: 0, y: 0, width: 140, depth: 24 });
    const spot = nextFreeSpotOnWall(24, 24, "base", "top", room, [wide]);
    // 140 + 24 > 144 -> clamp to wallLen - width = 120
    expect(spot.x).toBe(room.width - 24);
  });

  it("exposes friendly wall labels", () => {
    expect(WALL_LABELS.top).toBe("Back");
    expect(WALL_LABELS.bottom).toBe("Front");
    expect(WALL_LABELS.left).toBe("Left");
    expect(WALL_LABELS.right).toBe("Right");
  });
});

describe("in-bounds clamping after resize", () => {
  it("pulls a cabinet back inside a shrunken room", () => {
    const p = cab({ x: 130, y: 110, width: 24, depth: 24 });
    const clamped = clampCabinetToRoom(p, { width: 120, depth: 100 });
    expect(clamped.x).toBe(120 - 24); // 96
    expect(clamped.y).toBe(100 - 24); // 76
  });

  it("leaves an in-bounds cabinet unchanged (same reference)", () => {
    const p = cab({ x: 10, y: 10, width: 24, depth: 24 });
    const clamped = clampCabinetToRoom(p, { width: 144, depth: 120 });
    expect(clamped).toBe(p);
  });

  it("accounts for rotation when clamping", () => {
    // 36 wide x 24 deep, rotated 90 -> occupies 24 wide x 36 deep
    const p = cab({ x: 130, y: 110, width: 36, depth: 24, rotation: 90 });
    const clamped = clampCabinetToRoom(p, { width: 120, depth: 100 });
    expect(clamped.x).toBe(120 - 24); // 96
    expect(clamped.y).toBe(100 - 36); // 64
  });

  it("clamps a list of cabinets", () => {
    const out = clampCabinetsToRoom(
      [cab({ uid: "a", x: 200, y: 0 }), cab({ uid: "b", x: 0, y: 200 })],
      { width: 100, depth: 100 }
    );
    expect(out[0].x).toBe(100 - 24);
    expect(out[1].y).toBe(100 - 24);
  });

  it("clamps the island zone inside the room", () => {
    const island = clampIslandToRoom({ x: 90, y: 90, width: 60, depth: 40 }, { width: 120, depth: 100 });
    expect(island).not.toBeNull();
    expect(island!.width).toBeLessThanOrEqual(120);
    expect(island!.x + island!.width).toBeLessThanOrEqual(120);
    expect(island!.y + island!.depth).toBeLessThanOrEqual(100);
  });

  it("returns null for a null island", () => {
    expect(clampIslandToRoom(null, { width: 120, depth: 100 })).toBeNull();
  });
});


describe("resize room by dragging a wall", () => {
  const room = { width: 144, depth: 120 };

  it("grows width when dragging the right wall outward", () => {
    expect(resizeRoomByWall(room, "right", 24).width).toBe(168);
    expect(resizeRoomByWall(room, "right", 24).depth).toBe(120);
  });

  it("shrinks width when dragging the right wall inward", () => {
    expect(resizeRoomByWall(room, "right", -24).width).toBe(120);
  });

  it("grows width when dragging the left wall outward (negative delta)", () => {
    expect(resizeRoomByWall(room, "left", -24).width).toBe(168);
  });

  it("changes depth for the front (bottom) wall", () => {
    expect(resizeRoomByWall(room, "bottom", 12).depth).toBe(132);
    expect(resizeRoomByWall(room, "bottom", 12).width).toBe(144);
  });

  it("changes depth for the back (top) wall (negative delta grows)", () => {
    expect(resizeRoomByWall(room, "top", -12).depth).toBe(132);
  });

  it("clamps to the sane room range", () => {
    expect(resizeRoomByWall(room, "right", 9999).width).toBe(ROOM_MAX_IN);
    expect(resizeRoomByWall(room, "right", -9999).width).toBe(ROOM_MIN_IN);
  });
});


describe("trim: crown miter allowance per wall", () => {
  it("adds the 3in miter allowance once per wall run", () => {
    // Two wall cabinets on the back wall (top): 30 + 30 = 60, +3 = 63.
    const a = cab({ placement: "wall", width: 30, depth: 12, x: 0, y: 0, rotation: 0 });
    const b = cab({ placement: "wall", width: 30, depth: 12, x: 30, y: 0, rotation: 0 });
    expect(crownLinearInches([a, b], ROOM_12x10)).toBe(63);
  });

  it("a 12in wall run needs a 15in cut", () => {
    const a = cab({ placement: "wall", width: 12, depth: 12, x: 0, y: 0, rotation: 0 });
    expect(crownLinearInches([a], ROOM_12x10)).toBe(15);
  });

  it("adds the allowance separately for cabinets on different walls", () => {
    // back wall: 30 along the wall (+3) = 33.
    // right wall: cabinet rotated 90, so its 12in depth runs ALONG the wall
    // (12 +3) = 15. Total = 48.
    const back = cab({ placement: "wall", width: 30, depth: 12, x: 0, y: 0, rotation: 0 });
    const right = cab({ placement: "wall", width: 30, depth: 12, x: 144 - 12, y: 40, rotation: 90 });
    expect(crownLinearInches([back, right], ROOM_12x10)).toBe(48);
  });

  it("returns 0 with no wall cabinets", () => {
    const base = cab({ placement: "base", width: 24, depth: 24 });
    expect(crownLinearInches([base], ROOM_12x10)).toBe(0);
  });

  it("MITER_ALLOWANCE_IN is 3", () => {
    expect(MITER_ALLOWANCE_IN).toBe(3);
  });
});

describe("trim: toe kick is continuous (no miter allowance)", () => {
  it("sums base + tall widths with no extra", () => {
    const a = cab({ placement: "base", width: 24, depth: 24 });
    const b = cab({ placement: "tall", width: 24, depth: 24 });
    expect(toeKickLinearInches([a, b])).toBe(48);
  });
});

describe("trim: batten molding (BAM) covers cabinet seams", () => {
  it("counts one seam between two flush base cabinets (base height 34.5)", () => {
    const a = cab({ placement: "base", width: 24, depth: 24, x: 0, y: 0 });
    const b = cab({ placement: "base", width: 24, depth: 24, x: 24, y: 0 });
    expect(battenLinearInches([a, b], ROOM_12x10)).toBe(34.5);
  });

  it("counts two seams across three flush cabinets", () => {
    const a = cab({ placement: "base", width: 24, depth: 24, x: 0, y: 0 });
    const b = cab({ placement: "base", width: 24, depth: 24, x: 24, y: 0 });
    const c = cab({ placement: "base", width: 24, depth: 24, x: 48, y: 0 });
    expect(battenLinearInches([a, b, c], ROOM_12x10)).toBe(69);
  });

  it("ignores cabinets that are not edge-to-edge (gap > tolerance)", () => {
    const a = cab({ placement: "base", width: 24, depth: 24, x: 0, y: 0 });
    const b = cab({ placement: "base", width: 24, depth: 24, x: 30, y: 0 });
    expect(battenLinearInches([a, b], ROOM_12x10)).toBe(0);
  });

  it("returns 0 for a single cabinet", () => {
    const a = cab({ placement: "base", width: 24, depth: 24, x: 0, y: 0 });
    expect(battenLinearInches([a], ROOM_12x10)).toBe(0);
  });

  it("batten profile is 3/4in x 3/16in", () => {
    expect(BATTEN_WIDTH_IN).toBe(0.75);
    expect(BATTEN_THICKNESS_IN).toBe(0.1875);
  });
});

describe("cabinetWall inference", () => {
  it("detects the wall a flush cabinet sits on", () => {
    const top = cab({ placement: "wall", width: 30, depth: 12, x: 10, y: 0, rotation: 0 });
    expect(cabinetWall(top, ROOM_12x10)).toBe("top");
    const right = cab({ placement: "wall", width: 30, depth: 12, x: 144 - 12, y: 40, rotation: 90 });
    expect(cabinetWall(right, ROOM_12x10)).toBe("right");
  });
});

describe("trimPiecesNeeded (stick rounding)", () => {
  it("rounds a 63in run up to one 8ft stick", () => {
    const t = trimPiecesNeeded(63);
    expect(t.pieces).toBe(1);
    expect(t.orderedFeet).toBe(8);
  });

  it("rounds just over one stick (with waste) up to two sticks", () => {
    // 90in * 1.1 = 99in > 96 -> 2 sticks
    const t = trimPiecesNeeded(90);
    expect(t.pieces).toBe(2);
    expect(t.orderedFeet).toBe(16);
  });

  it("returns 0 pieces for an empty run", () => {
    expect(trimPiecesNeeded(0).pieces).toBe(0);
  });
});

describe("countertopArea", () => {
  it("measures base run x standard depth", () => {
    const a = cab({ placement: "base", width: 36, depth: 24 });
    const b = cab({ placement: "base", width: 36, depth: 24 });
    const m = countertopArea([a, b]);
    expect(m.runInches).toBe(72);
    expect(m.linearFeet).toBe(6);
    // 72 * 25.5 / 144 = 12.75 -> ceil to 0.1 = 12.8
    expect(m.squareFeet).toBeCloseTo(12.8, 1);
    expect(m.hasIsland).toBe(false);
  });

  it("ignores wall and tall cabinets", () => {
    const wall = cab({ placement: "wall", width: 30, depth: 12 });
    const tall = cab({ placement: "tall", width: 24, depth: 24 });
    expect(countertopArea([wall, tall]).runInches).toBe(0);
  });

  it("adds the island footprint", () => {
    const base = cab({ placement: "base", width: 36, depth: 24 });
    const m = countertopArea([base], { width: 48, depth: 24 });
    expect(m.hasIsland).toBe(true);
    // base 36*25.5=918 + island 48*24=1152 = 2070 /144 = 14.375 -> 14.4
    expect(m.squareFeet).toBeCloseTo(14.4, 1);
  });

  it("COUNTERTOP_DEPTH_IN is 25.5", () => {
    expect(COUNTERTOP_DEPTH_IN).toBe(25.5);
  });
});


describe("doorPanelKind", () => {
  it("maps door-style families to the correct panel treatment", () => {
    expect(doorPanelKind("Shaker")).toBe("shaker");
    expect(doorPanelKind("Slim Shaker")).toBe("shaker");
    expect(doorPanelKind("Double Shaker")).toBe("double-shaker");
    expect(doorPanelKind("Raised Panel")).toBe("raised");
    expect(doorPanelKind("Cathedral Arch")).toBe("raised");
    expect(doorPanelKind("Slab")).toBe("slab");
    expect(doorPanelKind("Contemporary")).toBe("slab");
    expect(doorPanelKind("Euro Flat")).toBe("slab");
    expect(doorPanelKind("Beaded")).toBe("beaded");
    expect(doorPanelKind("Inset")).toBe("inset");
  });

  it("defaults to shaker for unknown or empty styles", () => {
    expect(doorPanelKind(null)).toBe("shaker");
    expect(doorPanelKind(undefined)).toBe("shaker");
    expect(doorPanelKind("Mystery Style")).toBe("shaker");
  });

  it("prioritizes 'double' over plain shaker", () => {
    expect(doorPanelKind("Double Slim Shaker")).toBe("double-shaker");
  });
});


import { addOnRecommendations, baseCabinetCount, wallCabinetCount, exposedSideCount } from "./design";

describe("add-on recommendations (don't forget this)", () => {
  it("counts base cabinets only", () => {
    const placed = [
      cab({ uid: "a", placement: "base" }),
      cab({ uid: "b", placement: "base" }),
      cab({ uid: "c", placement: "wall" }),
      cab({ uid: "d", placement: "tall" }),
    ];
    expect(baseCabinetCount(placed)).toBe(2);
  });

  it("always recommends the touch-up kit first, even with no cabinets", () => {
    const recs = addOnRecommendations([]);
    expect(recs.length).toBe(1);
    expect(recs[0].kind).toBe("touch-up-kit");
    expect(recs[0].suggestCode).toBe("TUK");
    expect(recs[0].always).toBe(true);
  });

  it("adds a roll-out tray recommendation once base cabinets are placed", () => {
    const recs = addOnRecommendations([cab({ placement: "base" })]);
    const kinds = recs.map((r) => r.kind);
    expect(kinds).toContain("touch-up-kit");
    expect(kinds).toContain("roll-out-tray");
    // touch-up kit stays first in display order.
    expect(recs[0].kind).toBe("touch-up-kit");
  });

  it("does NOT recommend roll-out trays when only wall/tall cabinets are placed", () => {
    const recs = addOnRecommendations([
      cab({ placement: "wall" }),
      cab({ placement: "tall" }),
    ]);
    expect(recs.map((r) => r.kind)).not.toContain("roll-out-tray");
  });

  it("recommends an end panel once any base/wall/tall cabinet is placed", () => {
    expect(addOnRecommendations([]).map((r) => r.kind)).not.toContain("end-panel");
    const recs = addOnRecommendations([cab({ placement: "base" })]);
    const ep = recs.find((r) => r.kind === "end-panel");
    expect(ep).toBeTruthy();
    expect(ep!.suggestCode).toBe("BDEP");
  });

  it("recommends crown molding only when wall cabinets are present", () => {
    expect(addOnRecommendations([cab({ placement: "base" })]).map((r) => r.kind)).not.toContain(
      "crown-molding",
    );
    const recs = addOnRecommendations([cab({ placement: "wall" })]);
    const crown = recs.find((r) => r.kind === "crown-molding");
    expect(crown).toBeTruthy();
    expect(crown!.suggestCode).toBe("CM-8");
  });

  it("counts wall cabinets and exposed sides correctly", () => {
    const placed = [
      cab({ uid: "a", placement: "base" }),
      cab({ uid: "b", placement: "wall" }),
      cab({ uid: "c", placement: "tall" }),
    ];
    expect(wallCabinetCount(placed)).toBe(1);
    expect(exposedSideCount(placed)).toBe(3);
  });
});


describe("wallSpanMeasure (live drag tape, both sides)", () => {
  const room: RoomData = { width: 144, depth: 120 };

  it("measures to the walls on both sides when alone on the back wall", () => {
    // 24" cabinet placed 59" from the left, on the top (back) wall.
    const c = cab({ uid: "m", x: 59, y: 0, width: 24, depth: 24 });
    const m = wallSpanMeasure(c, room, [c], "top");
    expect(Math.round(m.before)).toBe(59); // left wall -> cabinet
    expect(Math.round(m.after)).toBe(144 - 59 - 24); // cabinet -> right wall = 61
    expect(m.beforeIsCabinet).toBe(false);
    expect(m.afterIsCabinet).toBe(false);
  });

  it("measures to a neighbor cabinet on the side where one exists", () => {
    const neighbor = cab({ uid: "n", x: 0, y: 0, width: 30, depth: 24 }); // ends at 30
    const moving = cab({ uid: "m", x: 50, y: 0, width: 24, depth: 24 }); // starts at 50
    const m = wallSpanMeasure(moving, room, [neighbor, moving], "top");
    expect(Math.round(m.before)).toBe(20); // 50 - 30 gap to neighbor
    expect(m.beforeIsCabinet).toBe(true);
    expect(Math.round(m.after)).toBe(144 - 74); // to right wall = 70
    expect(m.afterIsCabinet).toBe(false);
  });

  it("uses the nearest neighbor when several are on the same wall", () => {
    const a = cab({ uid: "a", x: 0, y: 0, width: 24, depth: 24 }); // ends 24
    const b = cab({ uid: "b", x: 30, y: 0, width: 12, depth: 24 }); // ends 42
    const moving = cab({ uid: "m", x: 60, y: 0, width: 24, depth: 24 }); // starts 60
    const m = wallSpanMeasure(moving, room, [a, b, moving], "top");
    expect(Math.round(m.before)).toBe(18); // nearest is b (ends 42): 60-42
    expect(m.beforeIsCabinet).toBe(true);
  });

  it("works on a vertical (left) wall using the depth axis", () => {
    // On the left wall, cabinets are rotated; run axis is Y.
    const moving = cab({ uid: "m", x: 0, y: 40, width: 24, depth: 24, rotation: 90 });
    const m = wallSpanMeasure(moving, room, [moving], "left");
    // rotated: along-wall span = original width (24); start y=40
    expect(Math.round(m.before)).toBe(40);
    expect(Math.round(m.after)).toBe(120 - 40 - 24); // 56
  });
});

describe("countertopSurfaces", () => {
  it("creates a slab for each base cabinet pinned to its wall", () => {
    const back = cab({ uid: "a", placement: "base", width: 36, depth: 24, x: 0, y: 0 });
    const surfaces = countertopSurfaces([back], ROOM_12x10);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]).toMatchObject({ x: 0, y: 0, width: 36, depth: CT_DEPTH, kind: "base" });
  });

  it("ignores wall and tall cabinets (no top)", () => {
    const wall = cab({ placement: "wall", width: 30 });
    const tall = cab({ placement: "tall", width: 24 });
    expect(countertopSurfaces([wall, tall], ROOM_12x10)).toHaveLength(0);
  });

  it("pins a front-wall slab to the bottom of the room", () => {
    const front = cab({ placement: "base", width: 24, depth: 24, x: 10, y: 96 });
    const [s] = countertopSurfaces([front], ROOM_12x10);
    expect(s.y).toBe(ROOM_12x10.depth - CT_DEPTH);
    expect(s.width).toBe(24);
  });

  it("adds an island slab matching its footprint", () => {
    const base = cab({ placement: "base", width: 24 });
    const surfaces = countertopSurfaces([base], ROOM_12x10, { x: 50, y: 40, width: 48, depth: 24 });
    const island = surfaces.find((s) => s.kind === "island");
    expect(island).toMatchObject({ x: 50, y: 40, width: 48, depth: 24 });
  });

  it("runs the countertop to the wall over a pulled blind corner (top wall, left corner)", () => {
    // Blind base pulled 3" off the left corner: cabinet starts at x=3, width 36.
    // The slab should extend back to x=0 and be 3" wider to cover the dead corner.
    const blind = cab({ uid: "bc", masterCode: "BBC-36", placement: "base", width: 36, depth: 24, x: 3, y: 0 });
    const [s] = countertopSurfaces([blind], ROOM_12x10);
    expect(s.x).toBe(0);
    expect(s.width).toBe(39); // 36 + 3" filler gap
  });

  it("uses the pull-spec travel when wider than the default filler", () => {
    // pullMax 42 on a 36" cabinet -> 6" of travel, wider than the 3" default.
    const blind = cab({ uid: "bc", masterCode: "BBC-36", placement: "base", width: 36, depth: 24, x: 6, y: 0, pullMin: 36, pullMax: 42 });
    const [s] = countertopSurfaces([blind], ROOM_12x10);
    expect(s.x).toBe(0);
    expect(s.width).toBe(42); // 36 + 6" travel
  });
});

describe("countertopMaterial + makeSink", () => {
  it("looks up a material by id and falls back to the first", () => {
    expect(countertopMaterial("black-granite").name).toBe("Black Granite");
    expect(countertopMaterial("nope").name).toBe(countertopMaterial(undefined).name);
  });

  it("builds a sink from a preset with a faucet on by default", () => {
    const sink = makeSink("double", 12, 4);
    expect(sink).toMatchObject({ type: "double", x: 12, y: 4, width: 33, faucet: true });
    expect(sink.uid).toMatch(/^sink-/);
  });
});

function opening(partial: Partial<WallOpening>): WallOpening {
  return {
    uid: "o",
    kind: "door",
    label: "Door",
    side: "top",
    offset: 0,
    width: 36,
    height: 80,
    sill: 0,
    ...partial,
  };
}

describe("freeSegmentsOnWall (break the run around openings)", () => {
  it("returns the whole wall when nothing blocks it", () => {
    const segs = freeSegmentsOnWall("top", ROOM_12x10, [], [], 9);
    expect(segs).toEqual([{ start: 0, length: 144 }]);
  });

  it("splits the wall into two segments around a centered door", () => {
    // 144" wall, 36" door centered at offset 54 → [0..54] and [90..144].
    const door = opening({ side: "top", offset: 54, width: 36 });
    const segs = freeSegmentsOnWall("top", ROOM_12x10, [], [door], 9);
    expect(segs.length).toBe(2);
    expect(segs[0]).toMatchObject({ start: 0, length: 54 });
    expect(segs[1]).toMatchObject({ start: 90, length: 54 });
  });

  it("subtracts existing base cabinets on the wall", () => {
    const existing = cab({ placement: "base", x: 0, y: 0, width: 48, depth: 24 });
    const segs = freeSegmentsOnWall("top", ROOM_12x10, [existing], [], 9);
    expect(segs.length).toBe(1);
    expect(segs[0]).toMatchObject({ start: 48, length: 96 });
  });

  it("drops segments narrower than minLen", () => {
    // Door leaves only 5" on the left, which is < minLen 9 → dropped.
    const door = opening({ side: "top", offset: 5, width: 36 });
    const segs = freeSegmentsOnWall("top", ROOM_12x10, [], [door], 9);
    expect(segs.every((s) => s.length >= 9)).toBe(true);
    expect(segs.some((s) => s.start === 0)).toBe(false);
  });

  it("works on a vertical (left) wall using the depth axis", () => {
    const door = opening({ side: "left", offset: 40, width: 30 });
    const segs = freeSegmentsOnWall("left", ROOM_12x10, [], [door], 9);
    // 120" deep wall, door 30 at 40 → [0..40] and [70..120].
    expect(segs[0]).toMatchObject({ start: 0, length: 40 });
    expect(segs[1]).toMatchObject({ start: 70, length: 50 });
  });

  // Regression: wall cabinets hang ABOVE base cabinets, so a fully base-filled
  // wall must still offer the whole run to a WALL cabinet. Previously the run
  // was blocked by bases regardless of layer, stranding new wall cabinets in
  // the room center (and dropping them from the Front-View elevation).
  it("ignores base cabinets when tiling the WALL layer", () => {
    const bases = [
      cab({ placement: "base", x: 0, y: 0, width: 48, depth: 24 }),
      cab({ placement: "base", x: 48, y: 0, width: 48, depth: 24 }),
      cab({ placement: "base", x: 96, y: 0, width: 48, depth: 24 }),
    ];
    const segs = freeSegmentsOnWall("top", ROOM_12x10, bases, [], 9, 0, "wall");
    expect(segs).toEqual([{ start: 0, length: 144 }]);
  });

  it("blocks the WALL layer only with other wall cabinets", () => {
    const wallCab = cab({ placement: "wall", x: 0, y: 0, width: 30, depth: 12 });
    const segs = freeSegmentsOnWall("top", ROOM_12x10, [wallCab], [], 9, 0, "wall");
    expect(segs).toEqual([{ start: 30, length: 114 }]);
  });

  it("tall cabinets block BOTH layers (floor-to-ceiling)", () => {
    const tall = cab({ placement: "tall", x: 0, y: 0, width: 24, depth: 24 });
    const wallSegs = freeSegmentsOnWall("top", ROOM_12x10, [tall], [], 9, 0, "wall");
    const baseSegs = freeSegmentsOnWall("top", ROOM_12x10, [tall], [], 9, 0, "base");
    expect(wallSegs).toEqual([{ start: 24, length: 120 }]);
    expect(baseSegs).toEqual([{ start: 24, length: 120 }]);
  });
});

describe("wallPlacementAt", () => {
  it("pins to the back wall and keeps the run-axis offset (top)", () => {
    const p = wallPlacementAt(24, 36, 24, "top", ROOM_12x10);
    expect(p).toMatchObject({ x: 24, y: 0, rotation: 0 });
  });
  it("pins to the front wall accounting for depth (bottom)", () => {
    const p = wallPlacementAt(24, 36, 24, "bottom", ROOM_12x10);
    expect(p).toMatchObject({ x: 24, y: 120 - 24, rotation: 0 });
  });
  it("rotates 90 and pins to the left wall (vertical run)", () => {
    const p = wallPlacementAt(40, 36, 24, "left", ROOM_12x10);
    expect(p).toMatchObject({ x: 0, y: 40, rotation: 90 });
  });
});

describe("rangeOvenClearanceViolations (corner filler rule)", () => {
  it("flags a range butting a cabinet at a wall corner with no filler", () => {
    // Range at the left corner (x=0), cabinet immediately to its right.
    const range = cab({ uid: "r", masterCode: "RANGE-30", placement: "appliance", x: 0, y: 0, width: 30, depth: 25 });
    const base = cab({ uid: "b", masterCode: "B-24", placement: "base", x: 30, y: 0, width: 24, depth: 24 });
    const bad = rangeOvenClearanceViolations([range, base], ROOM_12x10);
    expect(bad.has("r")).toBe(true);
  });

  it("does NOT flag when a clearance filler separates them", () => {
    const range = cab({ uid: "r", masterCode: "RANGE-30", placement: "appliance", x: 0, y: 0, width: 30, depth: 25 });
    // 3" gap (a filler would sit here) before the cabinet.
    const base = cab({ uid: "b", masterCode: "B-24", placement: "base", x: 33, y: 0, width: 24, depth: 24 });
    const bad = rangeOvenClearanceViolations([range, base], ROOM_12x10);
    expect(bad.has("r")).toBe(false);
  });

  it("does NOT flag a range in the middle of a wall (not at a corner)", () => {
    const range = cab({ uid: "r", masterCode: "RANGE-30", placement: "appliance", x: 60, y: 0, width: 30, depth: 25 });
    const base = cab({ uid: "b", masterCode: "B-24", placement: "base", x: 90, y: 0, width: 24, depth: 24 });
    const bad = rangeOvenClearanceViolations([range, base], ROOM_12x10);
    expect(bad.has("r")).toBe(false);
  });

  it("exposes a 3\" standard clearance filler width", () => {
    expect(RANGE_CLEARANCE_FILLER_IN).toBe(3);
  });
});

describe("wall cabinet elevation rules", () => {
  it("a standard 30in wall cabinet tops at 84in (bottom 54)", () => {
    const box = elevationBox(cab({ placement: "wall", width: 30, height: 30 }));
    expect(box.bottom).toBe(54);
    expect(box.bottom + box.height).toBe(84);
  });

  it("a short 12in bridge wall cabinet tops at 84in (bottom 72)", () => {
    const box = elevationBox(cab({ placement: "wall", width: 30, height: 12, masterCode: "W-30-12", description: "30x12 Bridge Wall Cabinet" }));
    expect(box.bottom).toBe(72);
    expect(box.bottom + box.height).toBe(84);
  });

  it("a tall 36in wall cabinet is bottom-anchored at 54in (tops at 90)", () => {
    const box = elevationBox(cab({ placement: "wall", width: 30, height: 36, masterCode: "W-30-36", description: "30x36 Wall Cabinet" }));
    expect(box.bottom).toBe(54);
    expect(box.bottom + box.height).toBe(90);
  });

  it("a 42in wall cabinet is bottom-anchored at 54in (tops at 96)", () => {
    const box = elevationBox(cab({ placement: "wall", width: 30, height: 42, masterCode: "W-30-42", description: "30x42 Wall Cabinet" }));
    expect(box.bottom).toBe(54);
    expect(box.bottom + box.height).toBe(96);
  });

  it("a glass stacker sits ON TOP of the wall cabinet below (bottom at 84in)", () => {
    const box = elevationBox(cab({ placement: "wall", width: 30, height: 12, masterCode: "W-30-12GD", description: "30x12 Stacker Wall Cabinet with Glass Door" }));
    expect(box.bottom).toBe(84);
    expect(box.height).toBe(12);
  });

  it("a user mountBottom override always wins over the default rule", () => {
    const box = elevationBox(cab({ placement: "wall", width: 30, height: 30, mountBottom: 60 }));
    expect(box.bottom).toBe(60);
  });

  it("base cabinets always sit on the floor (bottom 0)", () => {
    expect(elevationBox(cab({ placement: "base", width: 24, height: 34.5 })).bottom).toBe(0);
  });

  it("isStacker detects stacker cabinets and ignores plain wall cabinets", () => {
    expect(isStacker({ description: "30x12 Stacker Wall Cabinet with Glass Door" })).toBe(true);
    expect(isStacker({ description: "30\" x 12\" Bridge Wall Cabinet" })).toBe(false);
  });
});

describe("wall cabinet clearance from doors/windows", () => {
  const room: RoomData = { width: 144, depth: 120 };
  // A window centered on the top wall: 36" wide, centered -> offset 54..90.
  function topWindow(offset: number, width = 36): WallOpening {
    return { uid: "win", kind: "window", label: "Window", side: "top", offset, width, height: 36, sill: 40 };
  }

  it("flags a wall cabinet sitting within 3\" of a window", () => {
    // Window 54..90. Wall cabinet ending at 92 is 2" away -> violation.
    const wall = cab({ uid: "w1", placement: "wall", x: 92, y: 0, width: 30, depth: 12 });
    const bad = wallOpeningClearanceViolations([wall], [topWindow(54)], room);
    expect(bad.has("w1")).toBe(true);
  });

  it("passes a wall cabinet that keeps >= 3\" from the window", () => {
    // Window 54..90. Wall cabinet starting at 93 (3" clear) -> ok.
    const wall = cab({ uid: "w2", placement: "wall", x: 93, y: 0, width: 30, depth: 12 });
    const bad = wallOpeningClearanceViolations([wall], [topWindow(54)], room);
    expect(bad.has("w2")).toBe(false);
  });

  it("ignores base cabinets (only wall cabinets must clear openings)", () => {
    const base = cab({ uid: "b1", placement: "base", x: 91, y: 0, width: 24, depth: 24 });
    const bad = wallOpeningClearanceViolations([base], [topWindow(54)], room);
    expect(bad.has("b1")).toBe(false);
  });

  it("uses the standard 3\" clearance default", () => {
    expect(WALL_OPENING_CLEARANCE_IN).toBe(3);
  });

  it("pads openings by the clearance when computing wall free segments", () => {
    // Window 54..90 on a 144 wall. With 3" clearance the blocked band becomes
    // 51..93, so the right-hand free segment starts at 93 (not 90).
    const segs = freeSegmentsOnWall("top", room, [], [topWindow(54)], 9, WALL_OPENING_CLEARANCE_IN);
    const right = segs.find((s) => s.start >= 90);
    expect(right).toBeDefined();
    expect(right!.start).toBeCloseTo(93, 1);
  });
});

describe("blind corner pull spec", () => {
  it("blindPullRange returns null when spec missing", () => {
    expect(blindPullRange({})).toBeNull();
    expect(blindPullRange({ pullMin: 36 })).toBeNull();
    expect(blindPullRange({ pullMax: 39 })).toBeNull();
  });

  it("blindPullRange normalizes swapped min/max", () => {
    expect(blindPullRange({ pullMin: 39, pullMax: 36 })).toEqual({ min: 36, max: 39 });
    expect(blindPullRange({ pullMin: 36, pullMax: 39 })).toEqual({ min: 36, max: 39 });
  });

  it("flags a blind corner with NO pull spec as missing-spec", () => {
    const v = blindCornerSpecViolations([
      cab({ uid: "bc", masterCode: "BBC-36", placement: "base", width: 36 }),
    ]);
    expect(v.get("bc")).toBe("missing-spec");
  });

  it("passes a blind corner whose installed width is within [min,max]", () => {
    const v = blindCornerSpecViolations([
      cab({ uid: "bc", masterCode: "BBC-36", placement: "base", width: 37, pullMin: 36, pullMax: 39 }),
    ]);
    expect(v.has("bc")).toBe(false);
  });

  it("flags out-of-range when installed width exceeds max", () => {
    const v = blindCornerSpecViolations([
      cab({ uid: "bc", masterCode: "BBC-36", placement: "base", width: 41, pullMin: 36, pullMax: 39 }),
    ]);
    expect(v.get("bc")).toBe("out-of-range");
  });

  it("flags out-of-range when installed width is below min", () => {
    const v = blindCornerSpecViolations([
      cab({ uid: "bc", masterCode: "BBC-36", placement: "base", width: 34, pullMin: 36, pullMax: 39 }),
    ]);
    expect(v.get("bc")).toBe("out-of-range");
  });

  it("ignores non-blind cabinets", () => {
    const v = blindCornerSpecViolations([
      cab({ uid: "b", masterCode: "B-24", placement: "base", width: 24 }),
    ]);
    expect(v.size).toBe(0);
  });
});

describe("blindCornerAutoFiller — auto 3in filler opposite the pull", () => {
  const room: RoomData = { width: 144, depth: 120 };
  let n = 0;
  const uid = () => `f${n++}`;

  it("places a base filler just past a blind corner seated at the start corner of the top wall", () => {
    const blind = cab({ masterCode: "BBC-36", placement: "base", x: 0, y: 0, width: 33, depth: 24, rotation: 0 });
    const res = blindCornerAutoFiller(blind, room, uid);
    expect(res.ambiguous).toBe(false);
    expect(res.filler).not.toBeNull();
    // filler sits on the open (run) side, just past the cabinet's far end (x=33)
    expect(res.filler!.x).toBeCloseTo(33, 1);
    expect(res.filler!.y).toBe(0);
    expect(res.filler!.width).toBe(BLIND_CORNER_FILLER_WIDTH_IN);
    expect(res.filler!.placement).toBe("base");
  });

  it("places the filler before the cabinet when the blind corner is at the far end of the wall", () => {
    // cabinet's far end is flush with the right end of the top wall (144)
    const blind = cab({ masterCode: "BBC-36", placement: "base", x: 144 - 33, y: 0, width: 33, depth: 24, rotation: 0 });
    const res = blindCornerAutoFiller(blind, room, uid);
    expect(res.ambiguous).toBe(false);
    // filler sits just before the near end (x = (144-33) - 3)
    expect(res.filler!.x).toBeCloseTo(144 - 33 - BLIND_CORNER_FILLER_WIDTH_IN, 1);
  });

  it("is ambiguous (no filler) when the blind corner is not seated in a corner", () => {
    const blind = cab({ masterCode: "BBC-36", placement: "base", x: 60, y: 0, width: 33, depth: 24, rotation: 0 });
    const res = blindCornerAutoFiller(blind, room, uid);
    expect(res.ambiguous).toBe(true);
    expect(res.filler).toBeNull();
  });

  it("returns no filler for a non-blind cabinet", () => {
    const reg = cab({ masterCode: "B-24", placement: "base", x: 0, y: 0 });
    const res = blindCornerAutoFiller(reg, room, uid);
    expect(res.filler).toBeNull();
    expect(res.ambiguous).toBe(false);
  });
});


describe("diagonal corner footprint", () => {
  it("detects diagonal corner cabinets by code and description", () => {
    expect(isDiagonalCorner("DCW-2424")).toBe(true); // diagonal corner wall
    expect(isDiagonalCorner("WDC-24")).toBe(true);
    expect(isDiagonalCorner("DCB-36")).toBe(true); // diagonal corner base
    expect(isDiagonalCorner("AW-12")).toBe(true); // angled wall
    expect(isDiagonalCorner("X-99", "Diagonal Corner Wall Cabinet")).toBe(true);
    expect(isDiagonalCorner("B-24", "Base 24 inch")).toBe(false); // ordinary base
    expect(isDiagonalCorner("BBC-36", "Blind Corner Base")).toBe(false); // blind, not diagonal
  });

  it("gives a diagonal corner wall cabinet a SQUARE footprint (depth == width), not the shallow 12\" wall depth", () => {
    const d = footprintDepth({
      id: 1, masterCode: "DCW-2424", description: "Diagonal Corner Wall",
      category: "Wall", subCategory: null, width: "24", height: "30", depth: "12",
      placement: "wall", numberOfDoors: 1, numberOfDrawers: 0, isCornerCabinet: true,
    });
    expect(d).toBe(24); // square bounding box, NOT the 12" wall depth
  });

  it("gives a diagonal corner BASE cabinet a square footprint matching its width", () => {
    const d = footprintDepth({
      id: 2, masterCode: "DCB-36", description: "Diagonal Corner Base",
      category: "Base", subCategory: null, width: "36", height: "34.5", depth: "24",
      placement: "base", numberOfDoors: 1, numberOfDrawers: 0, isCornerCabinet: true,
    });
    expect(d).toBe(36);
  });

  it("leaves ordinary wall/base cabinets at their normal shallow depth", () => {
    expect(footprintDepth({
      id: 3, masterCode: "W-2430", description: "Wall 24x30",
      category: "Wall", subCategory: null, width: "24", height: "30", depth: "12",
      placement: "wall", numberOfDoors: 1, numberOfDrawers: 0, isCornerCabinet: false,
    })).toBe(12);
    expect(footprintDepth({
      id: 4, masterCode: "B-24", description: "Base 24",
      category: "Base", subCategory: null, width: "24", height: "34.5", depth: "24",
      placement: "base", numberOfDoors: 1, numberOfDrawers: 0, isCornerCabinet: false,
    })).toBe(24);
  });
});


describe("door swing (hinge side)", () => {
  it("defaults a single-door base to a Left hinge", () => {
    const p = cab({ masterCode: "B-18", description: "Base 18 1 Door", numberOfDoors: 1 });
    expect(resolveSwing(p)).toBe("left");
  });

  it("defaults a two-door base to a double door (no single hinge side)", () => {
    const p = cab({ masterCode: "B-36", description: "Base 36 2 Door", numberOfDoors: 2 });
    expect(resolveSwing(p)).toBe("double");
  });

  it("reports no swing for drawer-only bases", () => {
    const p = cab({ masterCode: "DB-15", description: "Drawer Base 15", numberOfDoors: 0, numberOfDrawers: 3 });
    expect(resolveSwing(p)).toBe("none");
    expect(hasDoorSwing(p)).toBe(false);
  });

  it("reports no swing for appliances and panels", () => {
    const appliance = cab({ masterCode: "RANGE-30", description: "Range 30", placement: "appliance" });
    expect(resolveSwing(appliance)).toBe("none");
    const panel = cab({ masterCode: "BDEP", description: "Base/Dishwasher End Panel", numberOfDoors: 0 });
    expect(resolveSwing(panel)).toBe("none");
  });

  it("honors an explicit swing override over the default", () => {
    const p = cab({ masterCode: "B-18", description: "Base 18 1 Door", numberOfDoors: 1, swing: "right" });
    expect(resolveSwing(p)).toBe("right");
  });

  it("toggles a single-door swing Left <-> Right and leaves double/none untouched", () => {
    expect(cycleSwing("left")).toBe("right");
    expect(cycleSwing("right")).toBe("left");
    expect(cycleSwing("double")).toBe("double");
    expect(cycleSwing("none")).toBe("none");
  });

  it("renders short and full hinge labels", () => {
    const cases: [DoorSwing, string, string][] = [
      ["left", "L", "Left hinge"],
      ["right", "R", "Right hinge"],
      ["double", "LR", "Double door"],
      ["none", "", ""],
    ];
    for (const [s, short, full] of cases) {
      expect(swingLabel(s)).toBe(short);
      expect(swingText(s)).toBe(full);
    }
  });
});


describe("corner base palette classification", () => {
  // The Design Tool's "Corner Base" tab uses isCornerCabinet (code/description)
  // OR the DB isCornerCabinet flag. These assert the code-level detector keeps
  // genuine corner bases in and end/filler/accessory items out.
  it("includes genuine corner base families", () => {
    expect(isCornerCabinet("BBC-45")).toBe(true); // blind corner base
    expect(isCornerCabinet("LSB33")).toBe(true); // lazy susan base
    expect(isCornerCabinet("ERB-36")).toBe(true); // easy reach corner base
    expect(isCornerCabinet("CSB-36")).toBe(true); // diagonal corner sink base
    expect(isCornerCabinet("CB-9", "Corner Base")).toBe(true); // corner base by desc
  });
  it("excludes end cabinets, fillers, and ordinary bases from corner base", () => {
    expect(isCornerCabinet("BEC-24")).toBe(false); // base END cabinet
    expect(isCornerCabinet("BA-24", "24in angled base end")).toBe(false); // end-of-run angled base
    expect(isCornerCabinet("DCFF42")).toBe(false); // diagonal corner FILLER (by code) is not a cabinet
    expect(isCornerCabinet("B-36", "Base 36 inch")).toBe(false); // ordinary base
    expect(isCornerCabinet("SB-30", "Sink Base 30")).toBe(false); // ordinary sink base
  });
});

describe("lazy-Susan / L-corner footprint", () => {
  it("classifies lazy-Susan, blind, and easy-reach corners as L-corner (not diagonal)", () => {
    expect(isLCornerCabinet("LSB36")).toBe(true);
    expect(isLCornerCabinet("LSB33")).toBe(true);
    expect(isLCornerCabinet("BBC-45", "Blind Corner Base")).toBe(true);
    expect(isLCornerCabinet("ERB-33", "Easy Reach Corner Base")).toBe(true);
    // Diagonal corners are NOT L-corners (they get the angled-face clip instead).
    expect(isLCornerCabinet("DCW-2424", "Diagonal Corner Wall")).toBe(false);
    // Ordinary cabinets are never L-corners.
    expect(isLCornerCabinet("B-24", "Base 24")).toBe(false);
  });

  it("gives a lazy-Susan corner base a SQUARE bounding box (depth == width)", () => {
    const lsb36 = footprintDepth({
      id: 1, masterCode: "LSB36", description: '36" Base Lazy Susan Cabinet',
      category: "Base", subCategory: "Lazy Susan Base", width: "36", height: "34.5", depth: "24",
      placement: "base", numberOfDoors: 2, numberOfDrawers: 0, isCornerCabinet: true,
    });
    expect(lsb36).toBe(36); // 36x36 square, NOT the 24" base depth

    const lsb33 = footprintDepth({
      id: 2, masterCode: "LSB33", description: '33" Base Lazy Susan Cabinet',
      category: "Base", subCategory: "Lazy Susan Base", width: "33", height: "34.5", depth: "24",
      placement: "base", numberOfDoors: 2, numberOfDrawers: 0, isCornerCabinet: true,
    });
    expect(lsb33).toBe(33); // 33x33 square
  });

  it("keeps a 24\" leg on each wall: notch ratio = legDepth / boxWidth", () => {
    // 36" lazy-Susan: 24/36 = 0.667 -> inner 12x12 notch
    expect(cornerLegRatioForPlaced({ width: 36, placement: "base" })).toBeCloseTo(24 / 36, 3);
    // 33" lazy-Susan: 24/33 = 0.727 -> inner 9x9 notch
    expect(cornerLegRatioForPlaced({ width: 33, placement: "base" })).toBeCloseTo(24 / 33, 3);
    // Wall corner uses the 12" wall depth.
    expect(cornerLegRatioForPlaced({ width: 24, placement: "wall" })).toBeCloseTo(12 / 24, 3);
  });

  it("L clip-path with a custom ratio still yields a valid 6-vertex L", () => {
    const path = cornerClipPath(0, 24 / 36);
    expect(path.startsWith("polygon(")).toBe(true);
    const points = path.replace(/polygon\(|\)/g, "").split(",");
    expect(points).toHaveLength(6);
    // The notch keep-percentage should appear as ~67%.
    expect(path).toContain("67%");
  });

  it("placedFootprint squares an OLD lazy-Susan stored with a shallow depth", () => {
    // Regression: a saved LSB36 with the legacy 36x24 box must render as 36x36.
    const old = cab({ masterCode: "LSB36", description: '36" Base Lazy Susan Cabinet', width: 36, depth: 24, rotation: 0 });
    const fp = placedFootprint(old);
    expect(fp.w).toBe(36);
    expect(fp.d).toBe(36); // squared, NOT the stale 24
  });

  it("placedFootprint keeps a rotated L-corner square (rotation is irrelevant for a square)", () => {
    const rotated = cab({ masterCode: "LSB33", description: '33" Base Lazy Susan Cabinet', width: 33, depth: 24, rotation: 90 });
    const fp = placedFootprint(rotated);
    expect(fp.w).toBe(33);
    expect(fp.d).toBe(33);
  });

  it("placedFootprint leaves ordinary cabinets as their rotated size", () => {
    const base = cab({ masterCode: "B-24", description: "Base 24", width: 24, depth: 24, rotation: 0 });
    expect(placedFootprint(base)).toEqual({ w: 24, d: 24 });
    const wall = cab({ masterCode: "W-3030", description: "Wall 30", width: 30, depth: 12, rotation: 90 });
    // Rotated 90deg: width/depth swap for a normal cabinet.
    expect(placedFootprint(wall)).toEqual({ w: 12, d: 30 });
  });

  it("normalizeLCornerDepths rewrites stale L-corner depth to a square box", () => {
    const input = [
      cab({ masterCode: "LSB36", description: '36" Base Lazy Susan Cabinet', width: 36, depth: 24 }),
      cab({ masterCode: "B-24", description: "Base 24", width: 24, depth: 24 }),
    ];
    const out = normalizeLCornerDepths(input);
    expect(out[0].width).toBe(36);
    expect(out[0].depth).toBe(36); // fixed
    // The ordinary cabinet is untouched.
    expect(out[1].depth).toBe(24);
  });

  it("normalizeLCornerDepths returns the SAME array reference when nothing changes", () => {
    const input = [
      cab({ masterCode: "LSB36", description: '36" Base Lazy Susan Cabinet', width: 36, depth: 36 }),
      cab({ masterCode: "B-24", description: "Base 24", width: 24, depth: 24 }),
    ];
    expect(normalizeLCornerDepths(input)).toBe(input);
  });
});
