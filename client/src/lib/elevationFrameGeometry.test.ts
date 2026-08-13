import { describe, expect, it } from "vitest";
import {
  drawerPanelInsetPx,
  elevationFrameInsetPx,
  frameInsetPxFromInches,
  isFlatPanelElevationStyle,
  isShakerElevationStyle,
  SHAKER_FACE_FRAME_PX,
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
