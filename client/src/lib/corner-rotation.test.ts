import { describe, it, expect } from "vitest";
import { cornerRotationForPlaced } from "./design";
import type { PlacedCabinet, RoomData } from "./design";

// Regression: ERB (and every L-corner cabinet) must cut its notch toward the
// room INTERIOR in all four corners — not just the top-left. Previously the
// rotation only resolved when the box was within 2" of BOTH walls, so a cabinet
// dragged near the top-right / bottom-right corner fell back to rotation 0
// (notch bottom-right), which pointed the notch at the wall and made the box
// look solid. cornerRotationForPlaced now picks the nearest room corner.

const ROOM: RoomData = { width: 120, depth: 120 } as RoomData;

function erbAt(x: number, y: number): PlacedCabinet {
  return {
    uid: "t",
    masterCode: "ERB-36",
    description: "Easy Reach Corner Base",
    width: 36,
    depth: 36,
    x,
    y,
    rotation: 0,
    placement: "base",
  } as PlacedCabinet;
}

describe("cornerRotationForPlaced — notch faces the interior in every corner", () => {
  it("top-left corner → rotation 0 (notch bottom-right)", () => {
    expect(cornerRotationForPlaced(erbAt(0, 0), ROOM)).toBe(0);
  });

  it("top-right corner → rotation 90 (notch bottom-left)", () => {
    // x so the box right edge meets the right wall (120 - 36 = 84)
    expect(cornerRotationForPlaced(erbAt(84, 0), ROOM)).toBe(90);
  });

  it("bottom-right corner → rotation 180 (notch top-left)", () => {
    expect(cornerRotationForPlaced(erbAt(84, 84), ROOM)).toBe(180);
  });

  it("bottom-left corner → rotation 270 (notch top-right)", () => {
    expect(cornerRotationForPlaced(erbAt(0, 84), ROOM)).toBe(270);
  });

  it("near (not snapped tight to) the top-right corner still resolves to 90", () => {
    // A few inches off both walls — used to fall back to rot 0 and look solid.
    expect(cornerRotationForPlaced(erbAt(80, 5), ROOM)).toBe(90);
  });

  it("near (not snapped tight to) the bottom-right corner still resolves to 180", () => {
    expect(cornerRotationForPlaced(erbAt(80, 80), ROOM)).toBe(180);
  });
});

// Lock in the exact clip-path polygon for each corner. The top-left (rot 0)
// shape is the user-confirmed-correct reference; the other three corners MUST be
// geometric mirrors of it so the L-notch always opens into the room interior.
// k = round(0.667*100) = 67, j = 100 - k = 33.
import { cornerClipPath } from "./design";

describe("cornerClipPath — every corner mirrors the confirmed top-left shape", () => {
  it("rot 0 (top-left): legs hug top+left, notch bottom-right", () => {
    expect(cornerClipPath(0)).toBe(
      "polygon(0 0, 100% 0, 100% 67%, 67% 67%, 67% 100%, 0 100%)"
    );
  });

  it("rot 90 (top-right): legs hug top+right, notch bottom-left", () => {
    expect(cornerClipPath(90)).toBe(
      "polygon(0 0, 100% 0, 100% 100%, 33% 100%, 33% 67%, 0 67%)"
    );
  });

  it("rot 180 (bottom-right): legs hug bottom+right, notch top-left", () => {
    expect(cornerClipPath(180)).toBe(
      "polygon(33% 0, 100% 0, 100% 100%, 0 100%, 0 33%, 33% 33%)"
    );
  });

  it("rot 270 (bottom-left): legs hug bottom+left, notch top-right", () => {
    expect(cornerClipPath(270)).toBe(
      "polygon(0 0, 67% 0, 67% 33%, 100% 33%, 100% 100%, 0 100%)"
    );
  });

  it("normalizes out-of-range rotations (450 ≡ 90, -90 ≡ 270)", () => {
    expect(cornerClipPath(450)).toBe(cornerClipPath(90));
    expect(cornerClipPath(-90)).toBe(cornerClipPath(270));
  });
});
