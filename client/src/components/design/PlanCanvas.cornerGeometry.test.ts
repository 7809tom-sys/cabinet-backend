import { describe, expect, it } from "vitest";
import { placedCornerGeometryKind, type PlacedCabinet } from "@/lib/design";
import { planCabinetClipPath, planCornerGeometry, planDiagonalFrontPath, planLazySusanTwoFrontPath } from "./PlanCanvas";

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
    expect(planDiagonalFrontPath(wdc, { width: 144, depth: 120 })).toBe("M100 50L50 100");
  });

  it("uses LS36's saved lazy-Susan record as the restored 36-inch L-corner footprint", () => {
    const ls36: PlacedCabinet = {
      uid: "ls3612",
      cabinetId: 3612,
      masterCode: "LS3612",
      description: "36 inch Lazy Susan Base Cabinet",
      placement: "base",
      x: 0,
      y: 0,
      width: 36,
      depth: 24,
      height: 34.5,
      rotation: 0,
      numberOfDoors: 2,
      numberOfDrawers: 0,
      cornerType: "lazy-susan",
    };

    expect(placedCornerGeometryKind(ls36)).toBe("l-shape");
    expect(planCornerGeometry(ls36)).toMatchObject({
      isDiagonal: false,
      isTriangle: false,
      isBlind: false,
      isConfiguredL: true,
    });
    expect(planCabinetClipPath(ls36, { width: 144, depth: 120 })).not.toBe(
      "polygon(0 0, 100% 0, 100% 50%, 50% 100%, 0 100%)",
    );
    expect(planDiagonalFrontPath(ls36, { width: 144, depth: 120 })).toBeUndefined();
    expect(planLazySusanTwoFrontPath(ls36)).toBe("M67 67L100 67M67 67L67 100");
  });
});
