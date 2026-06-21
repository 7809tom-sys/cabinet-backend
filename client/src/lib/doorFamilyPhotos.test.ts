import { describe, it, expect } from "vitest";
import { doorFamilyPhoto } from "./doorFamilyPhotos";

describe("doorFamilyPhoto", () => {
  it("returns a CDN url for each major panel family", () => {
    for (const ds of ["Shaker", "Raised Panel", "Slab", "Beaded", "Inset"]) {
      const url = doorFamilyPhoto({ doorStyle: ds });
      expect(url, ds).toBeTruthy();
      expect(url, ds).toMatch(/^https:\/\/.+\.(webp|png)$/);
    }
  });

  it("maps double-shaker style to the shaker photo", () => {
    const dbl = doorFamilyPhoto({ doorStyle: "Double Shaker" });
    const single = doorFamilyPhoto({ doorStyle: "Shaker" });
    expect(dbl).toBe(single);
  });

  it("falls back to a family (never throws) for unknown/empty style", () => {
    expect(() => doorFamilyPhoto({ doorStyle: null })).not.toThrow();
    expect(() => doorFamilyPhoto({})).not.toThrow();
    // unknown style still resolves to some family photo (doorPanelKind has a default)
    expect(doorFamilyPhoto({ doorStyle: "Mystery" })).toBeTruthy();
  });
});

import { kitchenSceneFor, KITCHEN_SCENES } from "./doorFamilyPhotos";

describe("kitchenSceneFor", () => {
  it("always returns a known kitchen scene URL (never null)", () => {
    const scenes = new Set(Object.values(KITCHEN_SCENES));
    for (const ds of ["Shaker White", "Raised Panel", "Slab", "Mystery", "", null]) {
      const url = kitchenSceneFor({ doorStyle: ds });
      expect(url, String(ds)).toBeTruthy();
      expect(scenes.has(url), String(ds)).toBe(true);
    }
  });

  it("resolves slab/contemporary styles to the natural slab scene", () => {
    expect(kitchenSceneFor({ doorStyle: "Contemporary Slab" })).toBe(
      KITCHEN_SCENES["slab-natural"]
    );
  });

  it("matches finish keywords to the right scene", () => {
    expect(kitchenSceneFor({ doorStyle: "Snow White Shaker" })).toBe(KITCHEN_SCENES["shaker-white"]);
    expect(kitchenSceneFor({ doorStyle: "Stone Gray Shaker" })).toBe(KITCHEN_SCENES["shaker-gray"]);
    expect(kitchenSceneFor({ doorStyle: "Espresso Shaker" })).toBe(KITCHEN_SCENES["shaker-espresso"]);
    expect(kitchenSceneFor({ doorStyle: "Cherry Raised Panel" })).toBe(KITCHEN_SCENES["raised-cherry"]);
  });

  it("keeps white/gray raised-panel styles in the bright shaker rooms", () => {
    expect(kitchenSceneFor({ doorStyle: "Pearl White Raised Panel" })).toBe(KITCHEN_SCENES["shaker-white"]);
    expect(kitchenSceneFor({ doorStyle: "Slate Gray Raised Panel" })).toBe(KITCHEN_SCENES["shaker-gray"]);
  });
});
