import { describe, expect, it } from "vitest";
import { refreshPlacedCabinetsFromMasterConfig, refreshPlacedCabinetsFromMasterRules, type PlacedCabinet } from "./design";

describe("master Cabinet Config refresh", () => {
  const placed = [
    {
      uid: "selected",
      cabinetId: 701,
      masterCode: "CUSTOM-36",
      description: "Configured cabinet",
      placement: "base",
      x: 0,
      y: 0,
      width: 36,
      depth: 24,
      rotation: 0,
      category: "Base",
      subCategory: "Standard Base",
      customProfile: null,
      genericDrawingUrl: null,
    },
    {
      uid: "other",
      cabinetId: 702,
      masterCode: "B-24",
      description: "Unaffected cabinet",
      placement: "base",
      x: 36,
      y: 0,
      width: 24,
      depth: 24,
      rotation: 0,
    },
  ] as PlacedCabinet[];

  it("updates every placed instance of the saved SKU without touching other cabinets", () => {
    const refreshed = refreshPlacedCabinetsFromMasterConfig(placed, {
      cabinetId: 701,
      category: "Specialty",
      subCategory: "Wine Rack",
      graphicType: "wine-rack",
      specImageUrl: "https://example.com/wine-rack.webp",
    });

    expect(refreshed[0]).toMatchObject({
      category: "Specialty",
      subCategory: "Wine Rack",
      customProfile: "wine-rack",
      genericDrawingUrl: "https://example.com/wine-rack.webp",
    });
    expect(refreshed[1]).toBe(placed[1]);
  });

  it("clears a custom profile when the master record returns to the standard drawing rule", () => {
    const refreshed = refreshPlacedCabinetsFromMasterConfig(placed, {
      cabinetId: 701,
      graphicType: "standard",
      specImageUrl: null,
    });

    expect(refreshed[0]?.customProfile).toBeNull();
    expect(refreshed[0]?.genericDrawingUrl).toBeNull();
  });

  it("hydrates stale saved placements from the currently loaded master rules", () => {
    const stale = [{
      ...placed[0],
      cabinetId: 9450022,
      masterCode: "BA-24",
      category: "Base",
      subCategory: "Standard Base",
      customProfile: null,
      genericDrawingUrl: null,
    }];
    const refreshed = refreshPlacedCabinetsFromMasterRules(stale, [{
      cabinetId: 9450022,
      category: "Base",
      subCategory: "Base End Cabinet",
      graphicType: "base_end_return",
      specImageUrl: null,
    }]);

    expect(refreshed[0]).toMatchObject({
      subCategory: "Base End Cabinet",
      customProfile: "base_end_return",
    });
  });
});
