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

  it("replaces stale faces with authored zero-door appliance-opening counts", () => {
    const refreshed = refreshPlacedCabinetsFromMasterConfig(placed, {
      cabinetId: 701,
      numberOfDoors: 0,
      numberOfDrawers: 1,
      openingType: "top",
      doorHeight: 0,
      drawerHeight: 12,
    });

    expect(refreshed[0]).toMatchObject({
      numberOfDoors: 0,
      numberOfDrawers: 1,
      openingType: "top",
      doorHeight: 0,
      drawerHeight: 12,
    });
  });

  it("hydrates corner, pull, and mount rules into saved instances without moving their 2D footprint", () => {
    const refreshed = refreshPlacedCabinetsFromMasterConfig(placed, {
      cabinetId: 701,
      isCornerCabinet: true,
      cornerType: "l-shape",
      pullMin: 3,
      pullMax: 6,
      mountBottom: 54,
      layoutSpec: JSON.stringify({ sections: [{ type: "drawers", count: 3, height: 12 }] }),
      drawerLayout: JSON.stringify([{ count: 3, height: 12 }]),
      graphicType: "corner-drawer-base",
    });

    expect(refreshed[0]).toMatchObject({
      isCornerCabinet: true,
      cornerType: "l-shape",
      pullMin: 3,
      pullMax: 6,
      mountBottom: 54,
      layoutSpec: JSON.stringify({ sections: [{ type: "drawers", count: 3, height: 12 }] }),
      drawerLayout: JSON.stringify([{ count: 3, height: 12 }]),
      customProfile: "corner-drawer-base",
      x: 0,
      y: 0,
      width: 36,
      depth: 24,
    });
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
