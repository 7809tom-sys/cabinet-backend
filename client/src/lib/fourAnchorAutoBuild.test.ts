import { describe, expect, it } from "vitest";
import { DEFAULT_ROOM } from "./design";
import { adjacentDishwasherCenterIn, anchorAlongStartIn, autoBuildSelectedWallCornerReservations, buildWallLabelMap, canRunFourAnchorAutoBuild, planFourAnchorAutoBuild, subtractAnchorRunReservations, wallLabelToEngineWallId } from "./fourAnchorAutoBuild";

describe("four-anchor wall-label mapping", () => {
  it.each([
    ["left", "right", ["top", "right", "bottom", "left"]],
    ["left", "left", ["top", "left", "bottom", "right"]],
    ["right", "left", ["top", "left", "bottom", "right"]],
    ["right", "right", ["top", "right", "bottom", "left"]],
  ] as const)("maps %s origin and %s traversal to the perimeter", (origin, direction, expected) => {
    const map = buildWallLabelMap(DEFAULT_ROOM, origin, direction);
    expect(Object.values(map).map((ref) => ref?.engineWallId)).toEqual(expected);
  });

  it("maps a Wall 2 sink to the engine right wall and converts its center to an edge offset", () => {
    const wall = wallLabelToEngineWallId("Wall 2", DEFAULT_ROOM, "left", "right");
    expect(wall?.engineWallId).toBe("right");
    expect(wall?.startCorner).toBe("start");
    expect(anchorAlongStartIn({ wallLabel: "Wall 2", centerOffsetIn: 48 }, 36, wall!)).toBe(30);
  });

  it("reverses center measurements when traversal starts from the opposite frame endpoint", () => {
    const wall = wallLabelToEngineWallId("Wall 2", DEFAULT_ROOM, "left", "left");
    expect(wall?.engineWallId).toBe("left");
    expect(wall?.startCorner).toBe("end");
    expect(anchorAlongStartIn({ wallLabel: "Wall 2", centerOffsetIn: 48 }, 36, wall!)).toBe(DEFAULT_ROOM.depth - 48 - 18);
  });

  it("computes a flush left or right dishwasher center from the selected sink base width", () => {
    expect(adjacentDishwasherCenterIn(60, 36, 24, "left")).toBe(30);
    expect(adjacentDishwasherCenterIn(60, 36, 24, "right")).toBe(90);
  });

  it("keeps a refrigerator opening and requested panel span empty while tiling its selected wall", () => {
    expect(subtractAnchorRunReservations([{ start: 0, length: 144 }], [{ start: 48.75, end: 87.25 }])).toEqual([
      { start: 0, length: 48.75 },
      { start: 87.25, length: 56.75 },
    ]);
  });

  it("reserves a corner shared by selected anchor walls from automatic straight-base fill", () => {
    const reservations = autoBuildSelectedWallCornerReservations("right", DEFAULT_ROOM, ["top", "right"]);
    expect(reservations).toEqual([{ start: 0, end: 24 }]);
  });

  it("does not reserve an unselected adjoining corner", () => {
    const reservations = autoBuildSelectedWallCornerReservations("right", DEFAULT_ROOM, ["top", "left"]);
    expect(reservations).toEqual([]);
  });
});

describe("four-anchor auto-build", () => {
  const required = {
    sink: { wallLabel: "Wall 1" as const, centerOffsetIn: 60 },
    stove: { wallLabel: "Wall 2" as const, centerOffsetIn: 48 },
    refrigerator: { wallLabel: "Wall 3" as const, centerOffsetIn: 36 },
  };

  it("places anchors in the required order and centers the sink on a measured window", () => {
    const result = planFourAnchorAutoBuild({
      layoutType: "single-wall",
      originCorner: "left",
      runDirection: "right",
      ...required,
      dishwasher: { wallLabel: "Wall 1", centerOffsetIn: 84 },
      sinkWindowCenter: { wallLabel: "Wall 1", centerOffsetIn: 60 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.anchors.map((anchor) => anchor.kind)).toEqual(["sink", "stove", "dishwasher", "refrigerator"]);
    expect(result.plan.anchors[0]).toMatchObject({ wallLabel: "Wall 1", centerOffsetIn: 60, source: "sink-window-centered" });
    expect(result.plan.surroundingRules).toEqual(["fillers", "blind corners", "molding", "substitution"]);
  });

  it("places an unmeasured dishwasher to the requested right of the sink", () => {
    const result = planFourAnchorAutoBuild({ ...required, layoutType: "galley", originCorner: "right", runDirection: "left", dishwasher: null, dishwasherSide: "right" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.anchors[2]).toMatchObject({ wallLabel: "Wall 1", centerOffsetIn: 60, source: "adjacent-to-sink", dishwasherSide: "right" });
  });

  it("preserves a left-of-sink choice for an unmeasured dishwasher", () => {
    const result = planFourAnchorAutoBuild({ ...required, layoutType: "galley", originCorner: "right", runDirection: "left", dishwasher: null, dishwasherSide: "left" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.anchors[2]).toMatchObject({ wallLabel: "Wall 1", source: "adjacent-to-sink", dishwasherSide: "left" });
  });

  it("asks for missing required measurements instead of guessing", () => {
    const result = planFourAnchorAutoBuild({ ...required, layoutType: "single-wall", originCorner: "left", runDirection: "right", sink: undefined as never });
    expect(result).toEqual({ ok: false, missing: ["sink"] });
  });

  it("is admin-only and refuses to overwrite hand-placed contents", () => {
    expect(canRunFourAnchorAutoBuild(true, false)).toBe(true);
    expect(canRunFourAnchorAutoBuild(false, false)).toBe(false);
    expect(canRunFourAnchorAutoBuild(true, true)).toBe(false);
  });
});
