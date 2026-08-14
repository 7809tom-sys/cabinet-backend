import { describe, expect, it } from "vitest";
import { placedCornerGeometryKind, type PlacedCabinet } from "@/lib/design";
import { planCabinetClipPath, planCornerGeometry } from "./PlanCanvas";

describe("PlanCanvas shared corner geometry", () => {
  it("uses the persisted WDC2430 diagonal classification instead of drawing a square or triangle", () => {
    const wdc: PlacedCabinet = {
      uid: "wdc2430",
      cabinetId: 2430,
      masterCode: "WDC2430",
      description: "24 inch Diagonal Wall Corner Cabinet",
      placement: "wall",
      x: 0,
      y: 0,
      width: 24,
      depth: 12,
      height: 30,
      rotation: 0,
      numberOfDoors: 2,
      numberOfDrawers: 0,
      cornerType: null,
    };

    expect(placedCornerGeometryKind(wdc)).toBe("diagonal");
    expect(planCornerGeometry(wdc)).toMatchObject({
      isDiagonal: true,
      isTriangle: false,
      isBlind: false,
      isConfiguredL: false,
    });
    expect(planCabinetClipPath(wdc, { width: 144, depth: 120 })).toBe(
      "polygon(0 0, 100% 0, 100% 50%, 50% 100%, 0 100%)",
    );
  });
});
