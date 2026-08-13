import { describe, expect, it } from "vitest";
import {
  drawerPanelInsetPx,
  elevationFrameInsetPx,
  frameInsetPxFromInches,
  isFlatPanelElevationStyle,
  isShakerElevationStyle,
  SHAKER_FACE_FRAME_PX,
  shakerFacePanelGeometry,
} from "./elevationFrameGeometry";

describe("elevation face-frame geometry", () => {
  it("uses Zenith Sage's authored 3-inch stile as a 12-pixel door reveal", () => {
    expect(frameInsetPxFromInches("3.00")).toBe(12);
  });

  it("applies the 3-inch square Shaker rule to both door and drawer faces", () => {
    expect(isShakerElevationStyle("shaker")).toBe(true);
    expect(isShakerElevationStyle("slim-shaker")).toBe(true);
    expect(isShakerElevationStyle("raised")).toBe(false);
    expect(elevationFrameInsetPx("shaker", 6)).toBe(SHAKER_FACE_FRAME_PX);
    expect(drawerPanelInsetPx(6, true)).toBe(SHAKER_FACE_FRAME_PX);
  });

  it("uses real door width for the Shaker center panel: 12-inch yields 6-inch and 21-inch yields 15-inch", () => {
    expect(shakerFacePanelGeometry(12, 30)).toMatchObject({
      stileInches: 3,
      railInches: 3,
      centerPanelWidthInches: 6,
      centerPanelHeightInches: 24,
      horizontalInsetPercent: 25,
    });
    expect(shakerFacePanelGeometry(21, 30)).toMatchObject({
      stileInches: 3,
      railInches: 3,
      centerPanelWidthInches: 15,
      centerPanelHeightInches: 24,
    });
    expect(shakerFacePanelGeometry(21, 30).horizontalInsetPercent).toBeCloseTo(14.285714, 5);
  });

  it("keeps the same 3-inch square Shaker frame across base, wall, tall, drawer, microwave, and specialty fronts", () => {
    const cabinetFrontFamilies = [
      "base cabinet",
      "wall cabinet",
      "tall pantry",
      "drawer base",
      "microwave base",
      "specialty end cabinet",
    ];

    for (const family of cabinetFrontFamilies) {
      expect(elevationFrameInsetPx("shaker", null), family).toBe(SHAKER_FACE_FRAME_PX);
      expect(drawerPanelInsetPx(null, true), family).toBe(SHAKER_FACE_FRAME_PX);
    }
  });

  it("falls back safely when a style has no authored frame width", () => {
    expect(frameInsetPxFromInches(null)).toBeNull();
    expect(drawerPanelInsetPx(null)).toBe(3);
  });

  it("keeps flat-panel slab doors and drawers unframed", () => {
    expect(isFlatPanelElevationStyle("slab")).toBe(true);
    expect(elevationFrameInsetPx("slab", 12)).toBeNull();
    expect(drawerPanelInsetPx(elevationFrameInsetPx("slab", 12))).toBe(3);
  });
});
