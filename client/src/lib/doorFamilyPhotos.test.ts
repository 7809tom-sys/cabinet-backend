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
