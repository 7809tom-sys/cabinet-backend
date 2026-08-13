import { describe, expect, it } from "vitest";
import { shouldClipEndAngleFace } from "./ElevationView";

describe("end-angle elevation face", () => {
  it("clips BEC-24's outer face even when its saved corner type is triangle", () => {
    expect(
      shouldClipEndAngleFace({
        masterCode: "BEC-24",
        description: '24" Base End Angle Cabinet',
        category: "Base",
        cornerType: "triangle",
        isCornerCabinet: false,
      }),
    ).toBe(true);
  });

  it("does not apply the end-angle face to an ordinary diagonal corner", () => {
    expect(
      shouldClipEndAngleFace({
        masterCode: "DCB-36",
        description: '36" Diagonal Corner Base Cabinet',
        category: "Base",
        cornerType: "diagonal",
        isCornerCabinet: true,
      }),
    ).toBe(false);
  });
});
