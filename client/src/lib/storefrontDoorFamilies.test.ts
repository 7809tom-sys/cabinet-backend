import { describe, expect, it } from "vitest";
import {
  doorFamilyKey,
  familyFinishKey,
  groupStorefrontDoorFamilies,
} from "./storefrontDoorFamilies";

const style = (overrides: Record<string, unknown> = {}) => ({
  styleId: 1,
  styleCode: "STYLE-1",
  name: "Sample",
  doorStyle: "Shaker",
  doorPanelType: "Recessed Panel",
  finish: "Painted",
  color: "White",
  roomSceneImageUrl: "/scene.jpg",
  ...overrides,
});

describe("storefront door family grouping", () => {
  it("derives profile families from metadata rather than names or SKUs", () => {
    expect(doorFamilyKey(style({ styleId: 10, name: "A completely unrelated name", styleCode: "X", doorStyle: "Slim Shaker" }))).toBe("slim-shaker");
    expect(doorFamilyKey(style({ styleId: 11, doorStyle: "Double Shaker" }))).toBe("double-shaker");
    expect(doorFamilyKey(style({ styleId: 12, doorStyle: "Flat Panel" }))).toBe("slab");
    expect(doorFamilyKey(style({ styleId: 13, doorPanelType: "Raised Panel", doorStyle: null }))).toBe("raised-panel");
  });

  it("keeps every style as a selectable family variant and leads with featured families", () => {
    const families = groupStorefrontDoorFamilies([
      style({ styleId: 1, doorStyle: "Shaker", color: "White" }),
      style({ styleId: 2, doorStyle: "Shaker", color: "Blue", featured: true, featuredSortOrder: 1 }),
      style({ styleId: 3, doorStyle: "Slim Shaker", color: "Green" }),
    ]);
    expect(families.map((family) => family.label)).toEqual(["Shaker", "Slim Shaker"]);
    expect(families[0].variants.map((variant) => variant.styleId).sort()).toEqual([1, 2]);
    expect(families[0].selected.styleId).toBe(2);
  });

  it("uses distinct style IDs in finish keys so each finish maps back to its exact style", () => {
    const whiteA = style({ styleId: 101, color: "White" });
    const whiteB = style({ styleId: 102, color: "White" });
    expect(familyFinishKey(whiteA)).not.toBe(familyFinishKey(whiteB));
  });
});
