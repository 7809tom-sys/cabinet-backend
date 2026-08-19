import { describe, expect, it } from "vitest";
import { renderBundleFloorPlanSvg } from "./bundleFloorPlan";
import { bundlePricePairs, calculateCurrentBundlePrice, publishedBundlePrice } from "./bundleDealPricing";

const snapshot = {
  room: { width: 144, depth: 120 },
  lockedDistributorId: 22,
  selectedSurfaces: [
    { id: 101, name: "Current Sink" },
    { id: 102, name: "Current Faucet" },
  ],
  placed: [
    { masterCode: "B-21", styleId: 7, x: 0, y: 0, width: 21, depth: 24, placement: "base" },
    { masterCode: "B-21", styleId: 7, x: 21, y: 0, width: 21, depth: 24, placement: "base" },
    { masterCode: "W-30-12", x: 0, y: 24, width: 30, depth: 12, placement: "wall" },
  ],
};

describe("bundleDealPricing", () => {
  it("preserves an approved saved package total instead of replacing it with a live reprice", () => {
    expect(publishedBundlePrice("4116.84")).toBe("4116.84");
    expect(publishedBundlePrice("not-a-price")).toBeNull();
  });

  it("uses saved placement styles, bundle fallback style, and repeated cabinet quantities", () => {
    expect(bundlePricePairs(snapshot, 9)).toEqual([
      { masterCode: "B-21", styleId: 7 },
      { masterCode: "B-21", styleId: 7 },
      { masterCode: "W-30-12", styleId: 9 },
    ]);
  });

  it("excludes visual-only appliances because they are not orderable cart products", () => {
    expect(bundlePricePairs({
      placed: [
        { masterCode: "B-21", styleId: 7, placement: "base" },
        { masterCode: "RANGE-30", styleId: 7, placement: "appliance" },
        { masterCode: "FRIDGE-36", styleId: 7, placement: "tall" },
      ],
    }, 9)).toEqual([{ masterCode: "B-21", styleId: 7 }]);
  });

  it("returns the current vendor-locked total rather than any stored historical total", () => {
    expect(calculateCurrentBundlePrice({
      snapshot,
      bundleStyleId: 9,
      lockedDistributorId: null,
      candidates: [
        { masterCode: "B-21", styleId: 7, distributorId: 22, homeownerPrice: 105 },
        { masterCode: "B-21", styleId: 7, distributorId: 99, homeownerPrice: 1 },
        { masterCode: "W-30-12", styleId: 9, distributorId: 22, homeownerPrice: 82.5 },
      ],
      surfaceCandidates: [
        { id: 101, homeownerPrice: 310 },
        { id: 102, homeownerPrice: 89.99 },
      ],
    })).toEqual({ total: 692.49, pricedItemCount: 5, missingItemCount: 0 });
  });

  it("refuses to present an exact bundle total when a saved item has no current price", () => {
    expect(calculateCurrentBundlePrice({
      snapshot,
      bundleStyleId: 9,
      lockedDistributorId: 22,
      candidates: [{ masterCode: "B-21", styleId: 7, distributorId: 22, homeownerPrice: 105 }],
      surfaceCandidates: [
        { id: 101, homeownerPrice: 310 },
        { id: 102, homeownerPrice: 89.99 },
      ],
    })).toEqual({ total: null, pricedItemCount: 4, missingItemCount: 1 });
  });
});

describe("renderBundleFloorPlanSvg", () => {
  it("renders the saved room outline, cabinet labels, and dimensions into an SVG image", () => {
    const svg = renderBundleFloorPlanSvg({
      ...snapshot,
      room: {
        ...snapshot.room,
        persistedEntities: { sinks: [{ x: 30, y: 5, width: 25, depth: 18, faucet: true }] },
      },
    }, "Current Price Kitchen");
    expect(svg).toContain("Current Price Kitchen — 2D Floor Plan");
    expect(svg).toContain("B-21");
    expect(svg).toContain("W-30-12");
    expect(svg).toContain("SINK");
    expect(svg).toContain("sink");
    expect(svg).toContain('144&quot; × 120&quot; room · 3 placed items');
  });
});
