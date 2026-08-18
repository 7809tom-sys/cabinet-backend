import { describe, expect, it } from "vitest";
import { threeDPlanMoveDelta } from "./designTool3DMovement";

const room = { width: 144, depth: 120, ceilingHeight: 96 } as const;

describe("3D cabinet movement plan mapping", () => {
  it("moves along and into a back-wall cabinet using screen-relative controls", () => {
    const backWall = { uid: "back", masterCode: "W-30", description: "Wall cabinet", placement: "wall", x: 42, y: 0, width: 30, depth: 12, height: 30, rotation: 0 } as any;
    expect(threeDPlanMoveDelta(backWall, room as any, "left", 3)).toEqual({ x: -3, y: 0 });
    expect(threeDPlanMoveDelta(backWall, room as any, "right", 3)).toEqual({ x: 3, y: 0 });
    expect(threeDPlanMoveDelta(backWall, room as any, "in", 3)).toEqual({ x: 0, y: 3 });
    expect(threeDPlanMoveDelta(backWall, room as any, "out", 3)).toEqual({ x: 0, y: -3 });
  });

  it("reverses horizontal directions on the front wall and turns them on a side wall", () => {
    const frontWall = { uid: "front", masterCode: "W-30", description: "Wall cabinet", placement: "wall", x: 42, y: 108, width: 30, depth: 12, height: 30, rotation: 180 } as any;
    const leftWall = { uid: "left", masterCode: "W-30", description: "Wall cabinet", placement: "wall", x: 0, y: 42, width: 30, depth: 12, height: 30, rotation: 90 } as any;
    expect(threeDPlanMoveDelta(frontWall, room as any, "left", 1)).toEqual({ x: 1, y: 0 });
    expect(threeDPlanMoveDelta(frontWall, room as any, "in", 1)).toEqual({ x: 0, y: -1 });
    expect(threeDPlanMoveDelta(leftWall, room as any, "left", 6)).toEqual({ x: 0, y: 6 });
    expect(threeDPlanMoveDelta(leftWall, room as any, "in", 6)).toEqual({ x: 6, y: 0 });
  });

  it("limits an invalid movement increment to the controlled attributes range", () => {
    const backWall = { uid: "back", masterCode: "W-30", description: "Wall cabinet", placement: "wall", x: 42, y: 0, width: 30, depth: 12, height: 30, rotation: 0 } as any;
    expect(threeDPlanMoveDelta(backWall, room as any, "right", 999)).toEqual({ x: 24, y: 0 });
  });
});
