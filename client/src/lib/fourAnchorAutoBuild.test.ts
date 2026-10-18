import { describe, expect, it } from "vitest";
import { DEFAULT_ROOM } from "./design";
import { anchorAlongStartIn, buildWallLabelMap, canRunFourAnchorAutoBuild, planFourAnchorAutoBuild, wallLabelToEngineWallId } from "./fourAnchorAutoBuild";

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

  it("places the dishwasher on the sink wall when no separate center is supplied", () => {
    const result = planFourAnchorAutoBuild({ ...required, layoutType: "galley", originCorner: "right", runDirection: "left" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.anchors[2]).toMatchObject({ wallLabel: "Wall 1", centerOffsetIn: 60, source: "adjacent-to-sink" });
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
