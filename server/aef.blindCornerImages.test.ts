import { describe, expect, it } from "vitest";
import { AEF_PROFESSIONAL_ASSETS, professionalAefImageFor } from "../scripts/refresh-aef-professional-images";

const source = (masterCode: string, doors = 1) => ({ id: 1, masterCode, category: "Base", numberOfDoors: doors, numberOfDrawers: 0, height: "34.75", depth: "24" });

describe("reported source-specific single-door blind corner images", () => {
  it.each([
    ["BBC37/40FH", "baseBlindBBC37"],
    ["BBC40/43FH", "baseBlindBBC40"],
    ["BBC43/46FH", "baseBlindBBC43"],
    ["BBC46/49FH", "baseBlindBBC46"],
  ] as const)("shows %s with its actual fixed blind panel and one operating door", (code, asset) => {
    expect(professionalAefImageFor(source(code))).toBe(asset);
    expect(AEF_PROFESSIONAL_ASSETS[asset]).toContain("single-door");
    expect(AEF_PROFESSIONAL_ASSETS[asset]).not.toContain("6c3ba901");
  });
  it("keeps BBC43 and BBC46 separate despite their equal 36-inch case widths", () => {
    expect(professionalAefImageFor(source("BBC43/46FH"))).not.toBe(professionalAefImageFor(source("BBC46/49FH")));
    expect(new Set([AEF_PROFESSIONAL_ASSETS.baseBlindBBC37, AEF_PROFESSIONAL_ASSETS.baseBlindBBC40, AEF_PROFESSIONAL_ASSETS.baseBlindBBC43, AEF_PROFESSIONAL_ASSETS.baseBlindBBC46]).size).toBe(4);
  });
  it("retains supplier-authoritative two-door blind fronts and unrelated source mappings", () => {
    expect(professionalAefImageFor({ ...source("BBC37/40FH"), configJson: JSON.stringify({ numberOfDoors: 2 }) })).toBe("baseBlindCornerDoubleDoor");
    expect(professionalAefImageFor(source("BBC49/52FH", 2))).toBe("baseBlindCornerDoubleDoor");
    expect(professionalAefImageFor(source("B30FH", 2))).toBe("baseFullHeightDoubleDoor");
  });
});
