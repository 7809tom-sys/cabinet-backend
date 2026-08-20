import { describe, expect, it } from "vitest";
import { nearestFreeWallDropStart } from "./designTool3DDropPlacement";

describe("nearestFreeWallDropStart", () => {
  const segments = [{ start: 0, length: 18 }, { start: 42, length: 54 }];

  it("uses the gap under the actual 3D drop instead of the first available run", () => {
    expect(nearestFreeWallDropStart(60, 36, segments)).toBe(42);
  });

  it("centers the cabinet at the drop point when the selected gap can contain it", () => {
    expect(nearestFreeWallDropStart(78, 24, segments)).toBe(66);
  });

  it("rejects a drop that is outside a true width-fitting segment", () => {
    expect(nearestFreeWallDropStart(60, 60, segments)).toBeNull();
    expect(nearestFreeWallDropStart(28, 24, segments)).toBeNull();
  });
});
