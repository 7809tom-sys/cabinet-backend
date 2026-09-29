import { describe, expect, it } from "vitest";
import { freightClassFromDensity, genericCabinetPackage } from "./genericCabinetPackaging";

describe("generic cabinet packaging rule", () => {
  it("matches the approved B12 fallback example", () => {
    const pkg = genericCabinetPackage({ widthIn: 12, heightIn: 34.5, depthIn: 24, category: "Base" });
    expect(pkg).toMatchObject({ lengthIn: 24, widthIn: 35, heightIn: 7, weightLbs: 36, freightClass: "92.5" });
    expect(pkg?.cubicFt).toBeCloseTo(3.4, 1);
  });

  it("keeps base cartons at 24 inches long through B24", () => {
    const pkg = genericCabinetPackage({ widthIn: 24, heightIn: 34.5, depthIn: 24, category: "Base" });
    expect(pkg).toMatchObject({ lengthIn: 24, widthIn: 35, heightIn: 7 });
  });

  it("matches the approved B36 fallback example", () => {
    const pkg = genericCabinetPackage({ widthIn: 36, heightIn: 34.5, depthIn: 24, category: "Base" });
    expect(pkg).toMatchObject({ lengthIn: 36, widthIn: 35, heightIn: 7, weightLbs: 67, freightClass: "85" });
    expect(pkg?.cubicFt).toBeCloseTo(5.1, 1);
  });

  it("uses a 12-inch reference depth and the cabinet height for wall cartons", () => {
    const pkg = genericCabinetPackage({ widthIn: 30, heightIn: 30, depthIn: 12, category: "Wall" });
    expect(pkg).toMatchObject({ lengthIn: 30, widthIn: 30, heightIn: 7 });
  });

  it("fills a deterministic package for accessories and incomplete records", () => {
    expect(genericCabinetPackage({ widthIn: 24, heightIn: 34.5, depthIn: 24, category: "Accessory" }))
      .toMatchObject({ lengthIn: 35, widthIn: 24, heightIn: 7 });
    expect(genericCabinetPackage({ widthIn: null, heightIn: null, depthIn: null, category: "Accessory" }))
      .toMatchObject({ lengthIn: 12, widthIn: 12, heightIn: 6 });
  });

  it("treats every trim piece as two pounds and keeps its bundled length", () => {
    expect(genericCabinetPackage({
      widthIn: 96,
      heightIn: 3,
      depthIn: null,
      category: "Molding",
      description: 'Crown Molding - 96"',
    })).toMatchObject({ lengthIn: 96, widthIn: 3, heightIn: 2, weightLbs: 2, isTrim: true });
  });
});

describe("density freight class", () => {
  it("maps the stated example densities", () => {
    expect(freightClassFromDensity(10.6)).toBe("92.5");
    expect(freightClassFromDensity(13)).toBe("85");
  });
});
