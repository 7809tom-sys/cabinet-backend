import { describe, expect, it } from "vitest";
import { rankDoorMatches, type DoorCandidate } from "../shared/doorPhotoMatch";

const candidates: DoorCandidate[] = [
  {
    id: 1,
    styleCode: "SW",
    ourName: "Aero Blanc",
    doorStyle: "Slim Shaker",
    color: "White",
    finish: "Marshmallow",
    woodSpecies: "Maple",
    doorSampleImageUrl: "https://example.com/1.jpg",
    thumbnailImageUrl: null,
    roomSceneImageUrl: null,
  },
  {
    id: 2,
    styleCode: "OB",
    ourName: "Aero Obsidian",
    doorStyle: "Slim Shaker",
    color: "Black",
    finish: "Tricorn Black",
    woodSpecies: "Maple",
    doorSampleImageUrl: "https://example.com/2.jpg",
    thumbnailImageUrl: null,
    roomSceneImageUrl: null,
  },
  {
    id: 3,
    styleCode: "VC",
    ourName: "Vellum Crema",
    doorStyle: "Slab",
    color: "Cream",
    finish: "Creamy",
    woodSpecies: "MDF",
    doorSampleImageUrl: "https://example.com/3.jpg",
    thumbnailImageUrl: null,
    roomSceneImageUrl: null,
  },
];

describe("rankDoorMatches — vision result normalization", () => {
  it("maps vision IDs to catalog rows and sorts by confidence", () => {
    const ranked = rankDoorMatches(candidates, {
      matches: [
        { styleId: 2, confidence: 0.7, reasoning: "Dark slim shaker" },
        { styleId: 1, confidence: 0.91, reasoning: "White slim shaker" },
      ],
    });
    expect(ranked.map((r) => r.id)).toEqual([1, 2]);
    expect(ranked[0].ourName).toBe("Aero Blanc");
    expect(ranked[0].confidence).toBeCloseTo(0.91);
  });

  it("normalizes percentage confidence (>1) into 0..1", () => {
    const [first] = rankDoorMatches(candidates, {
      matches: [{ styleId: 1, confidence: 88, reasoning: "" }],
    });
    expect(first.confidence).toBeCloseTo(0.88);
  });

  it("accepts string IDs/confidence from a loose model response", () => {
    const ranked = rankDoorMatches(candidates, {
      matches: [{ styleId: "3", confidence: "0.5", reasoning: null }],
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe(3);
    expect(ranked[0].reasoning.length).toBeGreaterThan(0);
  });

  it("drops unknown IDs, dedupes, and caps at 3", () => {
    const ranked = rankDoorMatches(candidates, {
      matches: [
        { styleId: 1, confidence: 0.9, reasoning: "a" },
        { styleId: 1, confidence: 0.8, reasoning: "dup" },
        { styleId: 999, confidence: 0.95, reasoning: "ghost" },
        { styleId: 2, confidence: 0.6, reasoning: "b" },
        { styleId: 3, confidence: 0.4, reasoning: "c" },
      ],
    });
    expect(ranked.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("returns an empty list when the model yields nothing usable", () => {
    expect(rankDoorMatches(candidates, { matches: [] })).toEqual([]);
    expect(rankDoorMatches(candidates, null)).toEqual([]);
  });
});
