import { describe, expect, it } from "vitest";
import { nomenclatureFamilyFor, rankFamilyAlternatives, alternativeDifferences, type FamilyCandidate, type FamilySource } from "./nomenclatureFamily";

const base = (over: Partial<FamilySource> & { masterCode: string }): FamilySource => ({
  description: null, category: "Base", subCategory: null, placementType: "base",
  width: 36, height: 34.5, depth: 24, hingeSide: null, numberOfDoors: 2, numberOfDrawers: 0,
  isCornerCabinet: false, cornerType: null, ...over,
});
const cand = (id: number, price: number, over: Partial<FamilySource> & { masterCode: string }): FamilyCandidate & { customerPrice: number } =>
  ({ ...base(over), cabinetId: id, customerPrice: price });

describe("nomenclatureFamilyFor — one CORNER family", () => {
  it("tags every corner interior type as CORNER", () => {
    for (const code of ["ERB36", "BER36", "LSB36", "LS3612", "BBC42", "BLB39", "CSB36", "CDB36", "BER36ADA"]) {
      const tag = nomenclatureFamilyFor(base({ masterCode: code }));
      expect(tag.family, code).toBe("CORNER");
      expect(tag.cornerSubGroup, code).toBe("base-corner");
    }
    for (const code of ["WDC2436", "DCW2436", "WBC2730", "WER2436", "WCA1230", "DCW2436GD"]) {
      const tag = nomenclatureFamilyFor(base({ masterCode: code, placementType: "wall", category: "Wall", depth: 12 }));
      expect(tag.family, code).toBe("CORNER");
      expect(tag.cornerSubGroup, code).toBe("wall-corner");
    }
  });
  it("keeps AW angled wall-end cabinets and straight cabinets out of CORNER", () => {
    expect(nomenclatureFamilyFor(base({ masterCode: "AW1230", placementType: "wall" })).family).toBe("WALL");
    expect(nomenclatureFamilyFor(base({ masterCode: "B36" })).family).toBe("BASE");
    expect(nomenclatureFamilyFor(base({ masterCode: "W3030", placementType: "wall" })).family).toBe("WALL");
  });
  it("marks corner parts (sink fronts, trays) as parts so they are never suggested as cabinets", () => {
    expect(nomenclatureFamilyFor(base({ masterCode: "DCSF42", description: "42\" Diagonal Corner Sink Front", depth: 0.75 })).isPart).toBe(true);
    expect(nomenclatureFamilyFor(base({ masterCode: "CHROME TRAY 36", description: "Chrome Tray Insert for ERB36", placementType: "accessory" })).isPart).toBe(true);
  });
  it("classifies the corner function", () => {
    expect(nomenclatureFamilyFor(base({ masterCode: "ERB36" })).cornerFunction).toBe("easy-reach");
    expect(nomenclatureFamilyFor(base({ masterCode: "LSB36" })).cornerFunction).toBe("carousel");
    expect(nomenclatureFamilyFor(base({ masterCode: "BBC42" })).cornerFunction).toBe("blind");
    expect(nomenclatureFamilyFor(base({ masterCode: "DCW2436", placementType: "wall" })).cornerFunction).toBe("diagonal");
  });
});

describe("rankFamilyAlternatives — Part 4 order", () => {
  const source = base({ masterCode: "ERB36", description: "36\" Easy Reach Base", isCornerCabinet: true });
  it("ranks same width first, then same height/depth, then closest function", () => {
    const ranked = rankFamilyAlternatives(source, [
      cand(1, 900, { masterCode: "BBC42", width: 39, description: "42\" Blind Corner Base" }),
      cand(2, 700, { masterCode: "LSB36", width: 36, description: "36\" Base Easy Reach with Lazy Susan" }),
      cand(3, 650, { masterCode: "LS3612", width: 36, depth: 36, description: "36\" Lazy Susan Base" }),
      cand(4, 800, { masterCode: "BBC-36", width: 27, description: "36\" Blind Corner Base" }),
      cand(5, 500, { masterCode: "B36", description: "36\" Base" }), // not corner — excluded
      cand(6, 100, { masterCode: "DCSF42", width: 26.5, depth: 0.75, description: "Diagonal Corner Sink Front" }), // part — excluded
    ]);
    expect(ranked.map((r) => r.masterCode)).toEqual(["LSB36", "LS3612", "BBC42"]);
    expect(ranked[0].differences).toEqual(["carousel corner instead of easy-reach"]);
    expect(ranked[1].differences).toContain("12 in. deeper");
  });
  it("never suggests an unpriced cabinet", () => {
    const ranked = rankFamilyAlternatives(source, [cand(1, 0, { masterCode: "LSB36" })]);
    expect(ranked).toEqual([]);
  });
  it("explains the filler needed for a narrower cabinet", () => {
    const diffs = alternativeDifferences(source, cand(1, 1, { masterCode: "BER33", width: 33 }));
    expect(diffs[0]).toBe("3 in. narrower — add 1 1/2 in. filler each side");
  });
  it("does not cross base-corner / wall-corner sub-groups", () => {
    const ranked = rankFamilyAlternatives(source, [cand(1, 300, { masterCode: "WDC2436", placementType: "wall", width: 24, depth: 12 })]);
    expect(ranked).toEqual([]);
  });
});
