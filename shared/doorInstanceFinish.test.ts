import { describe, expect, it } from "vitest";
import { deltaE2000Hex } from "./ciede2000";
import {
  doorInstanceFinish,
  doorInstanceVariation,
  isNeutralGray,
  shiftFinishHex,
} from "./doorInstanceFinish";
import { nearestBrandSwatch } from "./doorFinishTint";

describe("door instance finish", () => {
  it("is stable for one door and different for the door beside it", () => {
    const left = doorInstanceVariation({ placementUid: "cab-a", position: "0,0", pieceIndex: 0 }, true);
    const again = doorInstanceVariation({ placementUid: "cab-a", position: "0,0", pieceIndex: 0 }, true);
    const right = doorInstanceVariation({ placementUid: "cab-a", position: "24,0", pieceIndex: 1 }, true);
    expect(again).toEqual(left);
    expect(right).not.toEqual(left);
    expect(left.rotation === 0 || left.rotation === Math.PI).toBe(true);
    expect(right.rotation === 0 || right.rotation === Math.PI).toBe(true);
    expect(left.scale).toBeGreaterThan(1.4);
    expect(left.scale).toBeLessThan(2.4);
  });

  it("keeps a solid gray paint gray instead of snapping it toward green", () => {
    const finish = doorInstanceFinish(
      { placementUid: "stone-gray-1", position: "12,0", pieceIndex: 0 },
      {
        ourName: "Shaker Gray",
        aliasName: "Stone Gray (Preston)",
        color: "Gray",
        woodSpecies: "Solid Birch",
        detectedHex: "#8d8f92",
        finishCategory: "paint",
      },
    );
    expect(finish.finishCategory).toBe("paint");
    expect(finish.application).toBe("opaque");
    expect(finish.usesGrain).toBe(false);
    expect(finish.scale).toBe(1);
    expect(isNeutralGray(finish.solidHex)).toBe(true);
    expect(finish.solidHex).not.toBe(nearestBrandSwatch("#8d8f92"));
    expect(deltaE2000Hex(finish.solidHex, "#244338")!).toBeGreaterThan(20);
    expect(deltaE2000Hex(finish.solidHex, "#8d8f92")!).toBeLessThan(12);
  });

  it("keeps hickory grain and gives two cabinets different crops and tones", () => {
    const first = doorInstanceFinish(
      { placementUid: "hickory-a", position: "0,0", sampleUrl: "/textures/rustic_hickory_vertical_grain_v2.webp" },
      { ourName: "Hickory Shaker", woodSpecies: "Hickory", detectedHex: "#b08968", finishCategory: "paint" },
    );
    const second = doorInstanceFinish(
      { placementUid: "hickory-b", position: "36,0", sampleUrl: "/textures/rustic_hickory_vertical_grain_v2.webp" },
      { ourName: "Hickory Shaker", woodSpecies: "Hickory", detectedHex: "#b08968" },
    );
    expect(first.usesGrain).toBe(true);
    expect(first.keepsRealWoodGrain).toBe(true);
    expect(first.application).toBe("translucent");
    expect(first.scale).toBeGreaterThan(1.4);
    expect(second.offsetX).not.toBeCloseTo(first.offsetX);
    expect(first.grainTintHex).not.toBe(second.grainTintHex);
  });

  it("does not paint a hue onto a neutral gray", () => {
    const shifted = shiftFinishHex("#8d8f92", { hueTurns: 0.2, lightness: 0.04 });
    expect(isNeutralGray(shifted)).toBe(true);
  });
});
