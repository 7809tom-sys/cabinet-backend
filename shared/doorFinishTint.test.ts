import { describe, expect, it } from "vitest";
import { deltaE2000Hex } from "./ciede2000";
import {
  BRAND_SWATCH_HEXES,
  DOOR_GRAIN_SHADES,
  nearestBrandSwatch,
  planDoorFinish,
} from "./doorFinishTint";

describe("planDoorFinish", () => {
  it("keeps Stone Gray as an opaque solid of its own gray, not the brand snap", () => {
    const plan = planDoorFinish({
      ourName: "Shaker Gray",
      aliasName: "Stone Gray (Preston)",
      color: "Gray",
      woodSpecies: "Solid Birch",
      finish: "Cobalt Abyss (Preston)",
    });
    expect(plan.ownHex).toBe("#8d8f92");
    expect(plan.finishCategory).toBe("paint");
    expect(plan.application).toBe("opaque");
    expect(plan.usesGrain).toBe(false);
    expect(plan.keepsRealWoodGrain).toBe(false);
    const snapped = nearestBrandSwatch(plan.ownHex);
    expect(BRAND_SWATCH_HEXES).toContain(snapped);
    expect(plan.ownHex).not.toBe(snapped);
    expect(deltaE2000Hex(plan.ownHex, snapped)!).toBeGreaterThan(5);
  });

  it("switches two different grays to two different own colors", () => {
    const stone = planDoorFinish({ detectedHex: "#8d8f92", finishCategory: "paint" });
    const light = planDoorFinish({ detectedHex: "#d5d4d0", finishCategory: "paint" });
    expect(stone.ownHex).not.toBe(light.ownHex);
    expect(stone.application).toBe("opaque");
    expect(light.application).toBe("opaque");
  });

  it("treats a detected stain as a translucent tint over wood grain", () => {
    const plan = planDoorFinish({
      ourName: "Chestnut",
      detectedHex: "#8a5a32",
      finishCategory: "stain",
    });
    expect(plan.finishCategory).toBe("stain");
    expect(plan.application).toBe("translucent");
    expect(plan.usesGrain).toBe(true);
    expect(plan.grainShade === "versa-shaker" || plan.grainShade === "expresso-shaker").toBe(true);
    expect(plan.ownHex).toBe("#8a5a32");
  });

  it("keeps hickory on real wood grain even when the crop looks flat", () => {
    const plan = planDoorFinish({
      ourName: "Hickory Shaker",
      woodSpecies: "Hickory",
      detectedHex: "#b08968",
      finishCategory: "paint",
    });
    expect(plan.finishCategory).toBe("stain");
    expect(plan.application).toBe("translucent");
    expect(plan.keepsRealWoodGrain).toBe(true);
    expect(plan.grainShade === "versa-shaker" || plan.grainShade === "expresso-shaker").toBe(true);
    expect(plan.ownHex).toBe("#b08968");
  });

  it("uses exactly four grain shades, split by paint and stain", () => {
    expect(DOOR_GRAIN_SHADES).toHaveLength(4);
    expect(new Set(DOOR_GRAIN_SHADES).size).toBe(4);
  });

  it("lets a saved renderHex win over the swatch reading", () => {
    const plan = planDoorFinish({ renderHex: "#112233", detectedHex: "#abcdef", finishCategory: "paint" });
    expect(plan.ownHex).toBe("#112233");
  });
});
