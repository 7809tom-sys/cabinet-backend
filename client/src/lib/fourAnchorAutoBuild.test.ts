import { describe, expect, it } from "vitest";
import { canRunFourAnchorAutoBuild, planFourAnchorAutoBuild } from "./fourAnchorAutoBuild";

describe("four-anchor auto-build", () => {
  const required = {
    sink: { x: 60, y: 0 },
    stove: { x: 120, y: 0 },
    refrigerator: { x: 180, y: 0 },
  };

  it("places anchors in the required order and centers the sink on a measured window", () => {
    const result = planFourAnchorAutoBuild({
      layoutType: "single-wall",
      originCorner: "left",
      runDirection: "right",
      ...required,
      dishwasher: { x: 84, y: 0 },
      sinkWindowCenter: { x: 60, y: 0 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.anchors.map((anchor) => anchor.kind)).toEqual([
      "sink", "stove", "dishwasher", "refrigerator",
    ]);
    expect(result.plan.anchors[0]).toMatchObject({ x: 60, source: "sink-window-centered" });
    expect(result.plan.surroundingRules).toEqual(["fillers", "blind corners", "molding", "substitution"]);
  });

  it("places the dishwasher adjacent to the sink only when its center is absent", () => {
    const result = planFourAnchorAutoBuild({
      ...required,
      layoutType: "galley",
      originCorner: "right",
      runDirection: "left",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.anchors[2]).toMatchObject({ x: 60, y: 0, source: "adjacent-to-sink" });
  });

  it("asks for missing required measurements instead of guessing", () => {
    const result = planFourAnchorAutoBuild({
      ...required,
      layoutType: "single-wall",
      originCorner: "left",
      runDirection: "right",
      sink: undefined as never,
    });
    expect(result).toEqual({ ok: false, missing: ["sink"] });
  });

  it("is admin-only and refuses to overwrite hand-placed contents", () => {
    expect(canRunFourAnchorAutoBuild(true, false)).toBe(true);
    expect(canRunFourAnchorAutoBuild(false, false)).toBe(false);
    expect(canRunFourAnchorAutoBuild(true, true)).toBe(false);
  });
});
