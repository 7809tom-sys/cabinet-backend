import { describe, it, expect } from "vitest";
import {
  isCornerCabinet, cornerClipPath, centerDistance, formatInches,
  isApplianceCode, applianceAsDesignCabinet, elevationBox, APPLIANCES,
  makeOpening, clampOpening, wallLength, OPENINGS,
  snapToWall, feetInchesToInches, inchesToFeetInches, clampRoomInches,
  ROOM_MIN_IN, ROOM_MAX_IN,
  nextFreeSpotOnWall, clampCabinetToRoom, clampCabinetsToRoom,
  clampIslandToRoom, WALL_LABELS, resizeRoomByWall,
  crownLinearInches, toeKickLinearInches, trimPiecesNeeded,
  miteredTrimInches, cabinetWall, countertopArea,
  MITER_ALLOWANCE_IN, COUNTERTOP_DEPTH_IN,
  doorPanelKind,
  type PlacedCabinet, type RoomData,
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
    expect(isCornerCabinet("BEC-24")).toBe(true); // base easy reach
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
    expect(codes).toContain("FRIDGE-36");
    expect(codes).toContain("DW-24");
    expect(codes).toContain("SINK-33");
    expect(codes).toContain("HOOD-30");
  });

  it("detects appliance master codes", () => {
    expect(isApplianceCode("RANGE-30")).toBe(true);
    expect(isApplianceCode("FRIDGE-36")).toBe(true);
    expect(isApplianceCode("B-24")).toBe(false);
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
  crownLinearInches, toeKickLinearInches, inchesToLinearFeet,
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
  it("falls back to the default wood finish for unknown names", () => {
    expect(finishColors("Mystery Style")).toEqual(DEFAULT_FINISH_COLORS);
  });
  it("handles null/empty input safely", () => {
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


import { addOnRecommendations, baseCabinetCount } from "./design";

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
    expect(recs.map((r) => r.kind)).toEqual(["touch-up-kit"]);
  });
});
