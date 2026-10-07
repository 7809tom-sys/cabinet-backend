import { describe, expect, it } from "vitest";
import {
  isPelicanBathroomFixtureProfileVerified,
  pelicanBathroomFixturePlacementText,
  verifiedPelicanBathroomFixtureProfile,
} from "./pelicanBathroomFixtureProfiles";
import { FURNITURE_CATALOG, makePelicanBathroomFixture } from "./design";

describe("Pelican bathroom fixture placement profiles", () => {
  it("uses exact official exterior envelopes for current toilet and bidet models", () => {
    expect(verifiedPelicanBathroomFixtureProfile("PL-12044")).toMatchObject({
      kind: "toilet",
      widthIn: 14 + 9 / 16,
      depthIn: 26 + 37 / 64,
      heightIn: 29 + 17 / 32,
      finish: "vitreous-china-white",
    });
    expect(verifiedPelicanBathroomFixtureProfile("PL-12230")).toMatchObject({
      kind: "toilet",
      widthIn: 15,
      depthIn: 26.4,
      heightIn: 20,
      toiletStyle: "smart",
    });
    expect(verifiedPelicanBathroomFixtureProfile("PL-A249 ADA")).toMatchObject({
      kind: "toilet",
      toiletStyle: "two-piece",
      heightIn: 31.125,
    });
    expect(verifiedPelicanBathroomFixtureProfile("PL-12248")).toMatchObject({
      kind: "bidet",
      widthIn: 14 + 11 / 64,
      depthIn: 21 + 21 / 32,
      heightIn: 16 + 9 / 64,
    });
  });

  it("distinguishes drain-side alcove tub profiles without inventing a 67-inch envelope", () => {
    expect(verifiedPelicanBathroomFixtureProfile("PL-02850L")).toMatchObject({
      kind: "alcove-tub",
      widthIn: 32 + 1 / 64,
      depthIn: 60,
      heightIn: 21 + 21 / 32,
      drain: "left",
    });
    expect(verifiedPelicanBathroomFixtureProfile("PL-02850R")).toMatchObject({ drain: "right" });
    expect(verifiedPelicanBathroomFixtureProfile('PL-02146 59"')).toMatchObject({
      kind: "freestanding-tub",
      widthIn: 29 + 21 / 64,
      depthIn: 59 + 1 / 16,
      heightIn: 22 + 53 / 64,
      drain: "center",
    });
    expect(verifiedPelicanBathroomFixtureProfile('PL-02146 67"')).toBeNull();
    expect(pelicanBathroomFixturePlacementText('PL-02146 67"')).toContain("pending");
  });

  it("rejects non-current and unresolved catalog rows from measured placement", () => {
    expect(isPelicanBathroomFixtureProfileVerified("PL-12228")).toBe(false);
    expect(isPelicanBathroomFixtureProfileVerified("PL-12243")).toBe(false);
    expect(isPelicanBathroomFixtureProfileVerified("PL-02849LNSO")).toBe(false);
  });

  it("persists a source product identity only for an exact measured profile", () => {
    const placed = makePelicanBathroomFixture({
      id: 9101,
      pelicanCode: "PL-12044 MB",
      name: "PL-12044 MB Vortex Toilet",
      category: "Toilets & Bidets",
      sellPrice: 599.95,
    }, 20, 32);
    expect(placed).toMatchObject({
      pelicanCode: "PL-12044 MB",
      pelicanProductId: 9101,
      pelicanSellPrice: 599.95,
      x: 20,
      y: 32,
    });
    expect(FURNITURE_CATALOG.find((item) => item.id === placed?.defId)).toMatchObject({
      category: "bathroom-fixture",
      pelicanCode: "PL-12044 MB",
      w: 14 + 9 / 16,
      d: 26 + 37 / 64,
    });
    expect(makePelicanBathroomFixture({
      id: 9102,
      pelicanCode: 'PL-02146 67"',
      name: "PL-02146 67-inch Tub",
      category: "Shower & Bath",
      sellPrice: 999.95,
    }, 0, 0)).toBeNull();
  });
});
