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

import { cabinetProductPhoto, kitchenSceneWithCopy } from "./doorFamilyPhotos";

describe("cabinetProductPhoto", () => {
  it("returns a base render for base/sink/drawer categories", () => {
    expect(cabinetProductPhoto({ category: "Base Cabinets", doorStyle: "Snow White Shaker" })).toContain("prod-base");
    expect(cabinetProductPhoto({ category: "Sink Base", doorStyle: "White" })).toContain("prod-base");
    expect(cabinetProductPhoto({ category: "Drawer Base", doorStyle: "Dove Gray" })).toContain("prod-base");
  });

  it("matches finish bucket within a category", () => {
    expect(cabinetProductPhoto({ category: "Base", doorStyle: "Stone Gray Shaker" })).toContain("prod-base-shaker-gray");
    expect(cabinetProductPhoto({ category: "Base", doorStyle: "Cherry Raised Panel" })).toContain("prod-base-cherry");
    expect(cabinetProductPhoto({ category: "Base", doorStyle: "Espresso Shaker" })).toContain("prod-base-espresso");
  });

  it("maps wall/upper categories to a wall render", () => {
    expect(cabinetProductPhoto({ category: "Wall Cabinets", doorStyle: "White" })).toContain("prod-wall");
    expect(cabinetProductPhoto({ category: "Upper", doorStyle: "Gray" })).toContain("prod-wall");
  });

  it("maps tall / vanity / accessory categories to their renders", () => {
    expect(cabinetProductPhoto({ category: "Tall Pantry", doorStyle: "White" })).toContain("prod-tall");
    expect(cabinetProductPhoto({ category: "Vanity", doorStyle: "White" })).toContain("prod-vanity");
    expect(cabinetProductPhoto({ category: "Crown Molding", doorStyle: "White" })).toContain("prod-accessory");
  });

  it("falls back gracefully for an unknown finish within a category (wall has no espresso render)", () => {
    const url = cabinetProductPhoto({ category: "Wall", doorStyle: "Espresso" });
    expect(url).toContain("prod-wall");
  });

  it("always returns a non-empty url even with empty inputs", () => {
    expect(cabinetProductPhoto({ category: null, doorStyle: null })).toContain("prod-base");
  });
});

describe("kitchenSceneWithCopy", () => {
  it("returns an image plus a title and blurb", () => {
    const r = kitchenSceneWithCopy({ doorStyle: "Snow White Shaker" });
    expect(r.image).toMatch(/^https:\/\//);
    expect(r.title.length).toBeGreaterThan(0);
    expect(r.blurb.length).toBeGreaterThan(0);
  });

  it("gives the white-shaker copy for white styles and cherry copy for cherry", () => {
    expect(kitchenSceneWithCopy({ doorStyle: "Arctic White Shaker" }).title).toMatch(/White Shaker/i);
    expect(kitchenSceneWithCopy({ doorStyle: "Cherry Raised Panel" }).title).toMatch(/Cherry/i);
  });

  it("never throws on null door style", () => {
    expect(() => kitchenSceneWithCopy({ doorStyle: null })).not.toThrow();
  });
});
