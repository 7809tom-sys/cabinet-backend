import { describe, expect, it } from "vitest";
import { applyAffiliateDistributorCuration, toFamily } from "./routers/storefront";

describe("affiliate storefront distributor curation", () => {
  it("strips a trailing supplier token from customer-facing style names", () => {
    const family = toFamily({
      id: 7,
      styleCode: "AERO",
      ourName: "Aero Blanc (Preston)",
      featuredLabel: null,
      whiteLabel: false,
      doorStyle: "Shaker",
      woodSpecies: null,
      finish: null,
      color: null,
      boxConstruction: null,
      drawerConstruction: null,
      hardware: null,
      frameSize: null,
      overlayType: null,
      doorPanelType: null,
      distributorId: 2,
      doorSampleImageUrl: null,
      roomSceneImageUrl: null,
      thumbnailImageUrl: null,
    });
    expect(family.name).toBe("Aero Blanc");
  });

  const families = [
    { styleId: 11, distributorId: 1, name: "Aspen" },
    { styleId: 12, distributorId: 2, name: "Birch" },
    { styleId: 13, distributorId: 1, name: "Cedar" },
  ];

  it("preserves legacy all-active-line visibility when an affiliate has not selected any distributor", () => {
    const result = applyAffiliateDistributorCuration(families, new Set(), new Set(), new Set());
    expect(result.map((family) => family.styleId)).toEqual([11, 12, 13]);
  });

  it("shows only cabinet lines from explicitly selected distributors", () => {
    const result = applyAffiliateDistributorCuration(families, new Set([1]), new Set(), new Set());
    expect(result.map((family) => family.styleId)).toEqual([11, 13]);
  });

  it("places a featured distributor's lines ahead of other selected lines", () => {
    const result = applyAffiliateDistributorCuration(families, new Set([1, 2]), new Set([2]), new Set());
    expect(result.map((family) => family.styleId)).toEqual([12, 11, 13]);
  });

  it("keeps individual featured style controls in effect alongside distributor featuring", () => {
    const result = applyAffiliateDistributorCuration(families, new Set([1, 2]), new Set(), new Set([13]));
    expect(result.map((family) => family.styleId)).toEqual([13, 11, 12]);
  });
});
