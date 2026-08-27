import { describe, expect, it } from "vitest";
import { nearestFreeWallDropStart, targetedSinkBaseForThreeDDrop } from "./designTool3DDropPlacement";

describe("nearestFreeWallDropStart", () => {
  const segments = [{ start: 0, length: 18 }, { start: 42, length: 54 }];

  it("uses the gap under the actual 3D drop instead of the first available run", () => {
    expect(nearestFreeWallDropStart(60, 36, segments)).toBe(42);
  });

  it("centers the cabinet at the drop point when the selected gap can contain it", () => {
    expect(nearestFreeWallDropStart(78, 24, segments)).toBe(66);
  });

  it("fits W-36-24 exactly into the Aspin SB36 upper opening from 54 to 90 inches", () => {
    expect(nearestFreeWallDropStart(72, 36, [{ start: 54, length: 36 }])).toBe(54);
  });

  it("rejects a drop that is outside a true width-fitting segment", () => {
    expect(nearestFreeWallDropStart(60, 60, segments)).toBeNull();
    expect(nearestFreeWallDropStart(28, 24, segments)).toBeNull();
  });
});

describe("targetedSinkBaseForThreeDDrop", () => {
  const placed = [
    { uid: "sink-36", masterCode: "SB-36", description: '36" Sink Base Cabinet', placement: "base" },
    { uid: "wall-12", masterCode: "W-1242", description: '12" Wall Cabinet', placement: "wall" },
  ] as never[];

  it("treats the visible sink-base/countertop hit as an intentional over-sink target", () => {
    expect(targetedSinkBaseForThreeDDrop(placed, { x: 0, y: 72, wall: "right", placementUid: "sink-36" })?.uid).toBe("sink-36");
  });

  it("does not reinterpret a neighboring wall-cabinet hit as a sink target", () => {
    expect(targetedSinkBaseForThreeDDrop(placed, { x: 0, y: 24, wall: "right", placementUid: "wall-12" })).toBeNull();
  });

  it("recognizes empty right-wall space directly above the sink run even when the wall ray has no placement UID", () => {
    const room = { width: 144, depth: 145, ceilingHeight: 96 };
    const rightWall = [
      { uid: "right-sink-36", masterCode: "SB-36", description: '36" Sink Base Cabinet', placement: "base", x: 120, y: 54, rotation: 90, width: 36, depth: 24, height: 34.5 },
      { uid: "right-wall-12", masterCode: "W-1242", description: '12" Wall Cabinet', placement: "wall", x: 132, y: 90, rotation: 90, width: 12, depth: 12, height: 42 },
    ] as never[];
    expect(targetedSinkBaseForThreeDDrop(rightWall, { x: 144, y: 72, wall: "right" }, room)?.uid).toBe("right-sink-36");
  });
});
