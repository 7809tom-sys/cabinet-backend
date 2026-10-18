import { describe, expect, it } from "vitest";
import { AEF_PROFESSIONAL_ASSETS, professionalAefImageFor } from "../scripts/refresh-aef-professional-images";

const wall = (masterCode: string, height: string) => ({ id: 1, masterCode, category: "Wall", numberOfDoors: 1, numberOfDrawers: 0, height, depth: "13.5" });

describe("reported WBC24 source-specific blind-corner wall images", () => {
  it.each([
    ["WBC24/2730", "30.25", "wallBlindWBC24x30"],
    ["WBC24/2735", "35.25", "wallBlindWBC24x35"],
    ["WBC24/2740", "40.25", "wallBlindWBC24x40"],
  ] as const)("shows %s's fixed 15-inch blind panel and single narrow door", (code, height, asset) => {
    expect(professionalAefImageFor(wall(code, height))).toBe(asset);
    expect(AEF_PROFESSIONAL_ASSETS[asset]).toContain("wall-blind-WBC24");
    expect(AEF_PROFESSIONAL_ASSETS[asset]).not.toContain("ad19ebad");
  });
  it("preserves supplier two-door overrides and ordinary wall cabinets", () => {
    expect(professionalAefImageFor({ ...wall("WBC24/2730", "30.25"), configJson: JSON.stringify({ numberOfDoors: 2 }) })).toBe("wallBlindCornerDoubleDoor");
    expect(professionalAefImageFor(wall("W1830", "30.25"))).toBe("wallSingleDoor");
    expect(professionalAefImageFor(wall("WBC27/3030", "30.25"))).toBe("wallBlindCorner");
  });
});
